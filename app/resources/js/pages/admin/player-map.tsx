import { Head, router, usePoll } from '@inertiajs/react';
import {
    AlertTriangle,
    Circle,
    Crosshair,
    Loader2,
    MapPin,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import PlayerActionDialogs from '@/components/player-action-dialogs';
import PlayerTeleportDialog from '@/components/player-teleport-dialog';
import type { TeleportDestination } from '@/components/player-teleport-dialog';
import PzMap from '@/components/pz-map';
import type { MapLocation, ZoneOverlay } from '@/components/pz-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';
import type { MapConfig, PlayerMarker } from '@/types/server';

type SafeZone = {
    id: string;
    name: string;
    x1: number;
    y1: number;
    x2: number;
    y2: number;
};

type Props = {
    markers: PlayerMarker[];
    onlineCount: number;
    serverStatus: 'offline' | 'starting' | 'online';
    mapConfig: MapConfig;
    hasTiles: boolean;
    usingLocalTiles: boolean;
    tilesGenerating: boolean;
    tileError: string | null;
    tileGenerationStage: string | null;
    tileGenerationStartedAt: string | null;
    safeZones: SafeZone[];
    positionsStale: boolean;
    positionsUpdatedAt: string | null;
};

const statusDotColor: Record<PlayerMarker['status'], string> = {
    online: 'fill-green-500 text-green-500',
    offline: 'fill-muted text-muted',
    dead: 'fill-red-500 text-red-500',
};

const ZONE_COLORS = [
    '#3b82f6',
    '#ef4444',
    '#22c55e',
    '#f59e0b',
    '#8b5cf6',
    '#ec4899',
];

export default function PlayerMap({
    markers,
    onlineCount,
    serverStatus,
    mapConfig,
    hasTiles,
    usingLocalTiles,
    tilesGenerating,
    tileError,
    tileGenerationStage,
    tileGenerationStartedAt,
    safeZones,
    positionsStale = false,
    positionsUpdatedAt = null,
}: Props) {
    usePoll(5000, {
        only: [
            'markers',
            'onlineCount',
            'serverStatus',
            'hasTiles',
            'usingLocalTiles',
            'tilesGenerating',
            'tileError',
            'tileGenerationStage',
            'tileGenerationStartedAt',
            'safeZones',
            'positionsStale',
            'positionsUpdatedAt',
        ],
    });

    const generationStage =
        tileGenerationStage === 'unpacking'
            ? 'Unpacking textures...'
            : tileGenerationStage === 'rendering'
              ? 'Rendering map tiles...'
              : 'Preparing render...';
    const generationStarted = tileGenerationStartedAt
        ? new Date(tileGenerationStartedAt).toLocaleString()
        : null;

    const zoneOverlays: ZoneOverlay[] = useMemo(
        () =>
            safeZones.map((zone, i) => ({
                ...zone,
                color: ZONE_COLORS[i % ZONE_COLORS.length],
            })),
        [safeZones],
    );

    const [kickTarget, setKickTarget] = useState<string | null>(null);
    const [banTarget, setBanTarget] = useState<string | null>(null);
    const [accessTarget, setAccessTarget] = useState<string | null>(null);
    const [teleportDialogOpen, setTeleportDialogOpen] = useState(false);
    const [teleportTarget, setTeleportTarget] = useState('');
    const [teleportDestination, setTeleportDestination] =
        useState<TeleportDestination>({
            x: '',
            y: '',
            z: '0',
        });
    const [teleportPicking, setTeleportPicking] = useState(false);
    const [teleportLoading, setTeleportLoading] = useState(false);

    const counts = useMemo(() => {
        const online = Math.max(
            onlineCount,
            markers.filter((m) => m.status === 'online').length,
        );
        const offline = markers.filter((m) => m.status === 'offline').length;
        const dead = markers.filter((m) => m.status === 'dead').length;
        return { online, offline, dead, total: markers.length };
    }, [markers, onlineCount]);
    const onlineMarkers = useMemo(
        () => markers.filter((marker) => marker.is_online),
        [markers],
    );

    function beginTeleport(marker: PlayerMarker) {
        setTeleportTarget(marker.username);
        setTeleportDestination({ x: '', y: '', z: '0' });
        setTeleportDialogOpen(false);
        setTeleportPicking(true);
    }

    function openTeleportDialog() {
        if (
            !onlineMarkers.some((marker) => marker.username === teleportTarget)
        ) {
            setTeleportTarget(onlineMarkers[0]?.username ?? '');
        }
        setTeleportPicking(false);
        setTeleportDialogOpen(true);
    }

    function handleLocationPicked(location: MapLocation) {
        setTeleportDestination((current) => ({
            x: String(Math.round(location.x)),
            y: String(Math.round(location.y)),
            z: current.z || '0',
        }));
        setTeleportPicking(false);
        setTeleportDialogOpen(true);
    }

    async function confirmTeleport() {
        if (
            !onlineMarkers.some((marker) => marker.username === teleportTarget)
        ) {
            return;
        }

        setTeleportLoading(true);
        const result = await fetchAction(
            `/admin/players/${encodeURIComponent(teleportTarget)}/teleport`,
            {
                data: {
                    x: Number(teleportDestination.x),
                    y: Number(teleportDestination.y),
                    z: Number(teleportDestination.z),
                },
                successMessage: `${teleportTarget} was teleported.`,
            },
        );
        setTeleportLoading(false);

        if (result !== null) {
            setTeleportDialogOpen(false);
            setTeleportPicking(false);
            setTeleportDestination({ x: '', y: '', z: '0' });
        }
    }

    function handleMarkerAction(marker: PlayerMarker, action: string) {
        switch (action) {
            case 'kick':
                setKickTarget(marker.username);
                break;
            case 'ban':
                setBanTarget(marker.username);
                break;
            case 'access':
                setAccessTarget(marker.username);
                break;
            case 'inventory':
                router.visit(`/admin/players/${marker.username}/inventory`);
                break;
            case 'teleport':
                beginTeleport(marker);
                break;
        }
    }

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Players', href: '/admin/players' },
        { title: 'Map', href: '/admin/players/map' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Player Map" />
            <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Player Map
                        </h1>
                        <p className="text-muted-foreground">
                            {`${String(counts.total)} players tracked`}
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Button
                            size="sm"
                            onClick={openTeleportDialog}
                            disabled={
                                serverStatus !== 'online' ||
                                onlineMarkers.length === 0
                            }
                        >
                            <MapPin className="mr-1.5 size-3.5" />
                            Teleport Player
                        </Button>
                        <Badge variant="outline" className="text-sm">
                            <Circle className="mr-1.5 size-2 fill-green-500 text-green-500" />
                            {`${String(counts.online)} Online`}
                        </Badge>
                        <Badge variant="outline" className="text-sm">
                            <Circle className="mr-1.5 size-2 fill-muted text-muted" />
                            {`${String(counts.offline)} Offline`}
                        </Badge>
                        {counts.dead > 0 && (
                            <Badge variant="outline" className="text-sm">
                                <Circle className="mr-1.5 size-2 fill-red-500 text-red-500" />
                                {`${String(counts.dead)} Dead`}
                            </Badge>
                        )}
                    </div>
                </div>

                {serverStatus === 'offline' && (
                    <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                        <AlertTriangle className="size-4 shrink-0" />
                        {
                            'Server is offline. Player positions show last known locations.'
                        }
                    </div>
                )}
                {positionsStale && (
                    <div
                        className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400"
                        data-testid="positions-stale-banner"
                    >
                        <AlertTriangle className="size-4 shrink-0" />
                        {positionsUpdatedAt
                            ? `Live positions have stopped updating (last update ${new Date(positionsUpdatedAt).toLocaleString()}). Markers show the last known locations.`
                            : 'Live positions have stopped updating. Markers show the last known locations.'}
                    </div>
                )}
                {serverStatus === 'starting' && (
                    <div className="flex items-center gap-2 rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-400">
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                        {
                            'Server is starting. Live positions will appear once the game server is ready.'
                        }
                    </div>
                )}

                <Card className="isolate flex-1">
                    <CardContent className="relative h-[350px] p-0 sm:h-[500px] lg:h-[600px]">
                        {teleportPicking && (
                            <div className="absolute top-2 left-1/2 z-[1001] flex w-[calc(100%-1rem)] max-w-md -translate-x-1/2 items-center justify-between gap-3 rounded-lg border border-primary/40 bg-background/95 px-4 py-3 shadow-lg backdrop-blur-sm">
                                <div className="flex min-w-0 items-center gap-2">
                                    <Crosshair className="size-4 shrink-0 text-primary" />
                                    <p className="truncate text-sm font-medium">
                                        {`Click the destination for ${teleportTarget}`}
                                    </p>
                                </div>
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setTeleportPicking(false)}
                                >
                                    Cancel
                                </Button>
                            </div>
                        )}
                        {!usingLocalTiles && tilesGenerating && (
                            <div className="absolute top-2 left-1/2 z-[1000] w-64 -translate-x-1/2 rounded-lg border bg-background/90 px-4 py-3 shadow-sm backdrop-blur-sm sm:w-72">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <Loader2 className="size-4 animate-spin text-primary" />
                                    Generating map tiles...
                                </div>
                                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full w-full animate-pulse rounded-full bg-primary/30" />
                                </div>
                                <p className="mt-1 text-xs text-muted-foreground">
                                    {generationStage}
                                </p>
                                {generationStarted && (
                                    <p className="text-xs text-muted-foreground">
                                        {`Started: ${generationStarted}`}
                                    </p>
                                )}
                            </div>
                        )}
                        {!usingLocalTiles && !tilesGenerating && tileError && (
                            <div className="absolute top-2 left-1/2 z-[1000] w-72 -translate-x-1/2 rounded-lg border border-red-500/30 bg-background/95 px-4 py-3 text-xs shadow-sm backdrop-blur-sm sm:w-96">
                                <div className="flex items-center gap-2 text-sm font-medium text-red-400">
                                    <AlertTriangle className="size-4 shrink-0" />
                                    Map tile generation failed.
                                </div>
                                <pre className="mt-1.5 max-h-24 overflow-auto rounded bg-muted/50 p-1.5 font-mono text-[11px] whitespace-pre-wrap text-muted-foreground">
                                    {tileError}
                                </pre>
                                <p className="mt-1.5 text-xs text-muted-foreground">
                                    {
                                        'Check storage/logs/pzmap2dzi.log on the app container, then re-run'
                                    }{' '}
                                    <code className="font-mono">
                                        {
                                            'php artisan zomboid:generate-map-tiles'
                                        }
                                    </code>
                                </p>
                            </div>
                        )}
                        {!usingLocalTiles && !tilesGenerating && !tileError && (
                            <div className="absolute top-2 left-1/2 z-[1000] -translate-x-1/2 rounded-md bg-muted/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
                                {'No map tiles available. Run'}{' '}
                                <code className="font-mono">
                                    php artisan zomboid:generate-map-tiles
                                </code>{' '}
                                {'to generate.'}
                            </div>
                        )}
                        <PzMap
                            markers={markers}
                            mapConfig={mapConfig}
                            hasTiles={hasTiles}
                            onMarkerAction={handleMarkerAction}
                            zones={zoneOverlays}
                            locationPickingMode={teleportPicking}
                            onLocationPicked={handleLocationPicked}
                            className="rounded-xl"
                        />
                    </CardContent>
                </Card>

                {markers.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{'Player Positions'}</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                                {markers.map((marker) => (
                                    <div
                                        key={marker.username}
                                        className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2"
                                    >
                                        <div className="flex items-center gap-2">
                                            <Circle
                                                className={`size-2 ${statusDotColor[marker.status]}`}
                                            />
                                            <span className="text-sm font-medium">
                                                {marker.name}
                                            </span>
                                        </div>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            {marker.x.toFixed(0)},{' '}
                                            {marker.y.toFixed(0)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>

            <PlayerActionDialogs
                kickTarget={kickTarget}
                banTarget={banTarget}
                accessTarget={accessTarget}
                onCloseKick={() => setKickTarget(null)}
                onCloseBan={() => setBanTarget(null)}
                onCloseAccess={() => setAccessTarget(null)}
                reloadOnly={['markers']}
            />
            <PlayerTeleportDialog
                open={teleportDialogOpen}
                players={onlineMarkers}
                target={teleportTarget}
                destination={teleportDestination}
                loading={teleportLoading}
                onOpenChange={setTeleportDialogOpen}
                onTargetChange={setTeleportTarget}
                onDestinationChange={setTeleportDestination}
                onPickLocation={() => {
                    setTeleportDialogOpen(false);
                    setTeleportPicking(true);
                }}
                onConfirm={confirmTeleport}
            />
        </AppLayout>
    );
}
