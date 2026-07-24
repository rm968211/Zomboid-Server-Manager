<?php

namespace App\Console\Commands;

use App\Services\MapConfigBuilder;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Process;

class GenerateMapTiles extends Command
{
    /** @var string */
    protected $signature = 'zomboid:generate-map-tiles
        {--force : Regenerate tiles even if they already exist}
        {--map= : Specific map name to generate (default: all)}
        {--workers= : Number of render workers (default: auto-detect CPU cores)}';

    /** @var string */
    protected $description = 'Generate DZI map tiles from PZ game data using pzmap2dzi';

    public function handle(MapConfigBuilder $mapConfig): int
    {
        $tilesPath = config('zomboid.map.tiles_path');
        $serverPath = config('zomboid.game_server_path');

        // Preconditions write 'waiting', not 'failed' — the scheduler retries
        // anything that isn't 'failed', and these resolve themselves (e.g. the
        // game server is still downloading via SteamCMD on first boot).
        if (! is_dir($serverPath)) {
            $this->error("Game server path does not exist: {$serverPath}");
            $this->writeStatus('waiting', "Game server path does not exist: {$serverPath}");

            return self::FAILURE;
        }

        if (! is_dir($serverPath.'/media')) {
            $this->error("Game server files not ready yet (no media/ directory in {$serverPath})");
            $this->writeStatus('waiting', "Game server files not ready yet (no media/ directory in {$serverPath})");

            return self::FAILURE;
        }

        // Check Python3 availability
        $python = Process::run(['python3', '--version']);
        if (! $python->successful()) {
            $this->error('Python3 is required but not found.');
            $this->writeStatus('failed', 'Python3 is required but not found.');

            return self::FAILURE;
        }

        $this->info('Python3 found: '.trim($python->output() ?: $python->errorOutput()));

        // Check for pzmap2dzi
        $pzmap2dziPath = $this->findPzmap2dzi();
        if ($pzmap2dziPath === null) {
            $this->error('pzmap2dzi not found.');
            $this->writeStatus('failed', 'pzmap2dzi not found.');

            return self::FAILURE;
        }

        $this->info("Using pzmap2dzi: {$pzmap2dziPath}");

        // Skip only when real tiles exist — a failed run leaves a full
        // directory tree of .empty markers, which doesn't count.
        if (! $this->option('force') && $mapConfig->hasLocalTiles()) {
            $this->warn('Tiles already exist. Use --force to regenerate.');

            return self::SUCCESS;
        }

        $this->writeStatus('running', null);

        // The renderer resumes from marker files, so stale output from a
        // previous (failed or forced) run must be cleared or it silently
        // produces nothing.
        if (is_dir($tilesPath.'/html')) {
            $this->info('Clearing previous tile output...');
            exec('rm -rf '.escapeshellarg($tilesPath.'/html'));
        }

        // Create output directory
        if (! is_dir($tilesPath)) {
            mkdir($tilesPath, 0755, true);
        }

        // Generate pzmap2dzi config
        $confPath = $this->generateConfig($serverPath, $tilesPath);
        $this->info("Generated config: {$confPath}");

        // Step 1: Unpack textures
        $this->info('Step 1/2: Unpacking textures...');
        if (! $this->runPzmap($pzmap2dziPath, $confPath, 'unpack')) {
            $this->writeStatus('failed', $this->tailLog());

            return self::FAILURE;
        }

        // Step 2: Render isometric tiles
        $this->info('Step 2/2: Rendering isometric tiles...');
        if (! $this->runPzmap($pzmap2dziPath, $confPath, ['render', 'base'])) {
            $this->writeStatus('failed', $this->tailLog());

            return self::FAILURE;
        }

        $this->info('Map tiles generated successfully at: '.$tilesPath);
        $this->writeStatus('success', null);

        return self::SUCCESS;
    }

    /**
     * Persist generation status so the admin UI can surface real progress/errors
     * instead of silently showing a generic "no tiles yet" message.
     */
    private function writeStatus(string $status, ?string $error): void
    {
        $statusPath = config('zomboid.map.status_path');
        $payload = [
            'status' => $status,
            'error' => $error,
            'updated_at' => now()->toIso8601String(),
        ];

        $tmpPath = $statusPath.'.tmp';
        file_put_contents($tmpPath, json_encode($payload, JSON_PRETTY_PRINT));
        rename($tmpPath, $statusPath);
    }

    private function tailLog(): string
    {
        $logFile = storage_path('logs/pzmap2dzi.log');
        if (! is_file($logFile)) {
            return 'Unknown error (no log file produced).';
        }

        $lines = file($logFile);

        return implode('', array_slice($lines, -20));
    }

    /**
     * @param  string|string[]  $subcommand
     */
    private function runPzmap(string $pzmap2dziPath, string $confPath, string|array $subcommand): bool
    {
        $pzmap2dziDir = dirname($pzmap2dziPath);
        $logFile = storage_path('logs/pzmap2dzi.log');
        $arguments = is_array($subcommand) ? $subcommand : [$subcommand];
        $label = implode(' ', $arguments);

        $this->line("Running pzmap2dzi: {$label}");
        $this->line("Output logged to: {$logFile}");

        $result = Process::path($pzmap2dziDir)
            ->timeout(3600)
            ->run(['python3', $pzmap2dziPath, '-c', $confPath, ...$arguments]);
        file_put_contents($logFile, $result->output().$result->errorOutput());

        if (! $result->successful()) {
            $this->error("pzmap2dzi '{$label}' failed with exit code: {$result->exitCode()}");
            if (is_file($logFile)) {
                // Show last 20 lines of the log for debugging
                $lines = file($logFile);
                $tail = array_slice($lines, -20);
                $this->error(implode('', $tail));
            }

            return false;
        }

        $this->info("Completed: {$label}");

        return true;
    }

    private function generateConfig(string $serverPath, string $tilesPath): string
    {
        $mapOption = $this->option('map') ?: 'default';
        if (! preg_match('/^[a-zA-Z0-9_-]+$/', $mapOption)) {
            throw new \InvalidArgumentException('Map name may contain only letters, numbers, underscores, and hyphens.');
        }

        $workerCount = max(1, (int) ($this->option('workers') ?: $this->detectCpuCores()));

        $this->info("Using {$workerCount} render workers");

        $config = <<<YAML
        pz_root: |-
            {$serverPath}

        output_root: |-
            {$tilesPath}

        output_entry: default
        output_route: map_data/

        map_conf_default: default.txt
        map_conf:
            - vanilla.txt

        base_map: {$mapOption}

        render_conf:
            verbose: true
            profile: false
            worker_count: {$workerCount}
            break_key: ''
            tile_size: 256
            tile_align_levels: 3
            # Fast preview mode: render only base ground layer.
            layer_range: [0, 1]
            omit_levels: 3
            image_fmt: jpg
            image_fmt_base_layer0: jpg
            image_save_options: {}
            enable_cache: false
            cache_limit_mb: 0
            top_view_square_size: 1
            top_view_color_mode: avg
            use_mark: false
            plants_conf:
                snow: false
                large_bush: false
                flower: false
                season: summer2
                tree_size: 2
                jumbo_tree_size: 4
                jumbo_tree_type: 0
                no_ground_cover: false
                unify_tree_type: -1
        YAML;

        // Config must live in pzmap2dzi/conf/ so relative map_conf paths resolve
        $confDir = dirname($this->findPzmap2dzi()).'/conf';
        $confPath = $confDir.'/generated.yaml';
        file_put_contents($confPath, $config);

        return $confPath;
    }

    private function detectCpuCores(): int
    {
        $cores = 4;

        if (is_readable('/proc/cpuinfo')) {
            $cpuinfo = file_get_contents('/proc/cpuinfo');
            $cores = substr_count($cpuinfo, 'processor');
        }

        return max(1, $cores);
    }

    private function findPzmap2dzi(): ?string
    {
        // Docker image — installed via Dockerfile
        $dockerPath = '/opt/pzmap2dzi/main.py';
        if (is_file($dockerPath)) {
            return $dockerPath;
        }

        // Check if pzmap2dzi is in PATH
        $which = Process::run(['which', 'pzmap2dzi']);
        if ($which->successful() && trim($which->output()) !== '') {
            return trim($which->output());
        }

        // Check common pip install location
        $pipPath = getenv('HOME').'/.local/bin/pzmap2dzi';
        if (is_file($pipPath)) {
            return $pipPath;
        }

        // Check local copy in project
        $localPath = base_path('tools/pzmap2dzi/main.py');
        if (is_file($localPath)) {
            return $localPath;
        }

        return null;
    }
}
