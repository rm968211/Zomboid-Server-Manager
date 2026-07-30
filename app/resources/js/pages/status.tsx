import { Head, usePoll } from '@inertiajs/react';
import { Circle, Clock, Map, Package, Users } from 'lucide-react';
import { GameStateWidget } from '@/components/game-state-widget';
import { Badge } from '@/components/ui/badge';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import { usePing } from '@/hooks/use-ping';
import PublicLayout from '@/layouts/public-layout';
import type { StatusPageData } from '@/types';

export default function Status({
    server,
    game_state,
    mods,
    server_name,
}: StatusPageData) {
    usePoll(5000, { only: ['server', 'game_state'] });
    const ping = usePing('/ping', 15000);

    return (
        <>
            <Head title={`${server_name} — ${'Server Status'}`} />
            <PublicLayout>
                {/* Content */}
                <main className="mx-auto max-w-7xl px-4 py-8">
                    {/* Server Status Hero */}
                    <div className="mb-8 text-center">
                        <h1 className="mb-2 text-3xl font-bold tracking-tight">
                            {server_name}
                        </h1>
                        <div className="flex items-center justify-center gap-2">
                            <Circle
                                className={`size-3 fill-current ${
                                    server.status === 'online'
                                        ? 'text-green-500'
                                        : server.status === 'starting'
                                          ? 'text-yellow-500'
                                          : 'text-red-500'
                                }`}
                            />
                            <span
                                className={`text-lg font-medium ${
                                    server.status === 'online'
                                        ? 'text-green-500'
                                        : server.status === 'starting'
                                          ? 'text-yellow-500'
                                          : 'text-red-500'
                                }`}
                            >
                                {server.status === 'online'
                                    ? 'Online'
                                    : server.status === 'starting'
                                      ? 'Starting up...'
                                      : 'Offline'}
                            </span>
                            {ping !== null && server.status === 'online' && (
                                <span className="text-sm text-muted-foreground">
                                    — {ping}ms
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Game State */}
                    {server.status !== 'offline' && (
                        <div className="mb-8">
                            <GameStateWidget gameState={game_state} />
                        </div>
                    )}

                    {/* Stats Grid */}
                    <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Players
                                </CardTitle>
                                <Users className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {server.player_count}
                                    {server.max_players !== null && (
                                        <span className="text-base font-normal text-muted-foreground">
                                            /{server.max_players}
                                        </span>
                                    )}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Map
                                </CardTitle>
                                <Map className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="truncate text-2xl font-bold">
                                    {server.map || 'N/A'}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Uptime
                                </CardTitle>
                                <Clock className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="truncate text-2xl font-bold">
                                    {server.uptime || 'N/A'}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-center justify-between pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Mods
                                </CardTitle>
                                <Package className="size-4 text-muted-foreground" />
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {mods.length}
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <div className="grid gap-6 lg:grid-cols-2">
                        {/* Online Players */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Users className="size-5" />
                                    Online Players
                                </CardTitle>
                                <CardDescription>
                                    {`${server.player_count} ${
                                        server.player_count !== 1
                                            ? 'players'
                                            : 'player'
                                    } connected`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {server.players.length > 0 ? (
                                    <div className="space-y-2">
                                        {server.players.map((player) => (
                                            <div
                                                key={player}
                                                className="flex items-center gap-2 rounded-md border border-border/50 px-3 py-2"
                                            >
                                                <Circle className="size-2 fill-green-500 text-green-500" />
                                                <span className="text-sm font-medium">
                                                    {player}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        {server.status === 'online'
                                            ? 'No players online'
                                            : server.status === 'starting'
                                              ? 'Server is starting...'
                                              : 'Server is offline'}
                                    </p>
                                )}
                            </CardContent>
                        </Card>

                        {/* Mod List */}
                        <Card>
                            <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                    <Package className="size-5" />
                                    Installed Mods
                                </CardTitle>
                                <CardDescription>
                                    {`${mods.length} ${
                                        mods.length !== 1 ? 'mods' : 'mod'
                                    } installed`}
                                </CardDescription>
                            </CardHeader>
                            <CardContent>
                                {mods.length > 0 ? (
                                    <div className="space-y-2">
                                        {mods.map((mod) => (
                                            <div
                                                key={mod.workshop_id}
                                                className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                                            >
                                                <span className="text-sm font-medium">
                                                    {mod.mod_id}
                                                </span>
                                                {mod.workshop_id && (
                                                    <Badge
                                                        variant="secondary"
                                                        className="text-xs"
                                                    >
                                                        {mod.workshop_id}
                                                    </Badge>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No mods installed
                                    </p>
                                )}
                            </CardContent>
                        </Card>
                    </div>
                </main>
            </PublicLayout>
        </>
    );
}
