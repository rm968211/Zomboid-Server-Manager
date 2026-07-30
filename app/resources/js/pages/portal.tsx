import { Head, Link, usePage } from '@inertiajs/react';
import PzMap from '@/components/pz-map';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime } from '@/lib/dates';
import { edit } from '@/routes/profile';
import type { BreadcrumbItem } from '@/types';
import type { MapConfig } from '@/types/server';

type PlayerPosition = {
    username: string;
    x: number;
    y: number;
    z: number;
    is_dead: boolean;
};

type PzAccount = {
    username: string;
    whitelisted: boolean;
    isOnline: boolean;
    syncedAt: string | null;
};

type Props = {
    pzAccount: PzAccount;
    hasEmail: boolean;
    emailVerified: boolean;
    playerPosition: PlayerPosition | null;
    mapConfig: MapConfig;
    hasTiles: boolean;
};

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Player Portal',
        href: '/portal',
    },
];

export default function Portal({
    pzAccount,
    hasEmail,
    emailVerified,
    playerPosition,
    mapConfig,
    hasTiles,
}: Props) {
    const { auth } = usePage().props;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Player Portal" />

            <div className="mx-auto max-w-3xl space-y-6 p-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Player Portal
                    </h1>
                    <p className="text-muted-foreground">
                        Manage your game account and profile settings.
                    </p>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>{'Game Account'}</CardTitle>
                        <CardDescription>
                            Your Project Zomboid server account details.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Username
                            </span>
                            <span className="font-mono text-sm">
                                {pzAccount.username}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Whitelist Status
                            </span>
                            {pzAccount.whitelisted ? (
                                <Badge variant="default">{'Whitelisted'}</Badge>
                            ) : (
                                <Badge variant="destructive">
                                    Not Whitelisted
                                </Badge>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">
                                Server Status
                            </span>
                            {pzAccount.isOnline ? (
                                <Badge className="bg-green-600">Online</Badge>
                            ) : (
                                <Badge variant="secondary">{'Offline'}</Badge>
                            )}
                        </div>
                        {pzAccount.syncedAt && (
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium">
                                    Last Synced
                                </span>
                                <span className="text-sm text-muted-foreground">
                                    {formatDateTime(pzAccount.syncedAt)}
                                </span>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>{'Profile'}</CardTitle>
                        <CardDescription>
                            {
                                'Your account settings and email verification status.'
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Email</span>
                            {hasEmail ? (
                                <div className="flex items-center gap-2">
                                    <span className="text-sm">
                                        {auth.user.email}
                                    </span>
                                    {emailVerified ? (
                                        <Badge variant="default">
                                            Verified
                                        </Badge>
                                    ) : (
                                        <Badge variant="outline">
                                            Unverified
                                        </Badge>
                                    )}
                                </div>
                            ) : (
                                <span className="text-sm text-muted-foreground">
                                    Not set
                                </span>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-3 pt-2">
                            <Button asChild variant="outline" size="sm">
                                <Link href={edit()}>{'Edit Profile'}</Link>
                            </Button>
                            <Button asChild variant="outline" size="sm">
                                <Link href="/settings/password">
                                    Change Password
                                </Link>
                            </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {
                                'Changing your password updates both web login and game server password.'
                            }
                        </p>

                        {!hasEmail && (
                            <p className="text-xs text-muted-foreground">
                                {
                                    'Add an email address to enable password recovery.'
                                }
                            </p>
                        )}
                    </CardContent>
                </Card>

                {playerPosition && (
                    <Card>
                        <CardHeader>
                            <CardTitle>{'Your Location'}</CardTitle>
                            <CardDescription>
                                {`Last known position on the map (${playerPosition.x.toFixed(0)}, ${playerPosition.y.toFixed(0)})`}
                            </CardDescription>
                        </CardHeader>
                        <CardContent className="h-[300px] p-0">
                            <PzMap
                                markers={[
                                    {
                                        username: pzAccount.username,
                                        name: pzAccount.username,
                                        x: playerPosition.x,
                                        y: playerPosition.y,
                                        z: playerPosition.z,
                                        status: playerPosition.is_dead
                                            ? 'dead'
                                            : pzAccount.isOnline
                                              ? 'online'
                                              : 'offline',
                                        is_online: pzAccount.isOnline,
                                    },
                                ]}
                                mapConfig={{
                                    ...mapConfig,
                                    center: {
                                        x: playerPosition.x,
                                        y: playerPosition.y,
                                    },
                                    defaultZoom: 5,
                                }}
                                hasTiles={hasTiles}
                                interactive={false}
                                className="rounded-b-xl"
                            />
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}
