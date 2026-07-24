<?php

use App\Services\MapConfigBuilder;
use Illuminate\Filesystem\Filesystem;

function makeTilesDir(int $skip, bool $withRealTiles): string
{
    $dir = sys_get_temp_dir().'/map-tiles-test-'.uniqid();
    $base = $dir.'/html/map_data/base';

    mkdir($base.'/layer0_files/0', 0755, true);
    mkdir($base.'/layer0_files/'.$skip, 0755, true);

    file_put_contents($base.'/map_info.json', json_encode([
        'w' => 288912, 'h' => 126076, 'skip' => $skip, 'sqr' => 128,
    ]));

    // The renderer always leaves only .empty markers in the omitted levels
    file_put_contents($base.'/layer0_files/0/0_0.empty', '');
    file_put_contents(
        $base.'/layer0_files/'.$skip.'/0_0.'.($withRealTiles ? 'jpg' : 'empty'),
        $withRealTiles ? 'jpeg-bytes' : '',
    );

    config(['zomboid.map.tiles_path' => $dir]);

    return $dir;
}

afterEach(function () {
    if (isset($this->tilesDir)) {
        (new Filesystem)->deleteDirectory($this->tilesDir);
    }
});

it('detects local tiles when the first rendered level has images', function () {
    $this->tilesDir = makeTilesDir(skip: 3, withRealTiles: true);

    $builder = new MapConfigBuilder;

    expect($builder->hasLocalTiles())->toBeTrue()
        ->and($builder->build()['source'])->toBe('local');
});

it('falls back to proxy when every level contains only empty markers', function () {
    $this->tilesDir = makeTilesDir(skip: 3, withRealTiles: false);

    $builder = new MapConfigBuilder;

    expect($builder->hasLocalTiles())->toBeFalse()
        ->and($builder->build()['source'])->toBe('proxy');
});

it('falls back to proxy when no tiles have been generated', function () {
    config(['zomboid.map.tiles_path' => sys_get_temp_dir().'/map-tiles-missing-'.uniqid()]);

    $config = (new MapConfigBuilder)->build();

    expect($config['source'])->toBe('proxy')
        ->and($config['tileUrl'])->toContain('/maps/42.19.0/base/layer0_files/')
        ->and($config['dzi'])->toMatchArray([
            'width' => 1157216,
            'height' => 509520,
            'x0' => 518144,
            'y0' => -69648,
            'sqr' => 64,
            'maxNativeZoom' => 21,
            'isometric' => true,
        ]);
});
