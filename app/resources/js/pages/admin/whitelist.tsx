import { Head, router } from '@inertiajs/react';
import {
    AlertTriangle,
    Plus,
    RefreshCw,
    Search,
    Settings,
    Shield,
    ShieldOff,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { SortIcon } from '@/components/sort-icon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useTableSort } from '@/hooks/use-table-sort';
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';

type PlayerEntry = {
    username: string;
    name: string;
    character_name: string | null;
    whitelisted: boolean;
    role: string;
    has_stored_credentials: boolean;
};

type WhitelistSettings = {
    open: boolean;
    auto_create_user_in_whitelist: boolean;
};

type SortKey = 'username' | 'role' | 'status';
type StatusFilter = 'all' | 'whitelisted' | 'not_whitelisted';

const roleBadgeVariant: Record<string, 'default' | 'secondary' | 'outline'> = {
    super_admin: 'default',
    admin: 'default',
    moderator: 'secondary',
    player: 'outline',
};

const roleOrder: Record<string, number> = {
    super_admin: 0,
    admin: 1,
    moderator: 2,
    player: 3,
};

export default function Whitelist({
    players,
    whitelist_settings,
}: {
    players: PlayerEntry[];
    whitelist_settings: WhitelistSettings;
}) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Whitelist Management', href: '/admin/whitelist' },
    ];

    const [showAdd, setShowAdd] = useState(false);
    const [passwordTarget, setPasswordTarget] = useState<string | null>(null);
    const [removeTarget, setRemoveTarget] = useState<string | null>(null);
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>('username');

    const [enforceWhitelist, setEnforceWhitelist] = useState(
        !whitelist_settings.open,
    );
    const [autoRegister, setAutoRegister] = useState(
        whitelist_settings.auto_create_user_in_whitelist,
    );
    const [savingSettings, setSavingSettings] = useState(false);
    const [restartRequired, setRestartRequired] = useState(false);

    const settingsDirty =
        enforceWhitelist !== !whitelist_settings.open ||
        autoRegister !== whitelist_settings.auto_create_user_in_whitelist;

    const whitelistedCount = players.filter((p) => p.whitelisted).length;

    const filteredPlayers = useMemo(() => {
        let result = players;

        if (statusFilter === 'whitelisted') {
            result = result.filter((p) => p.whitelisted);
        } else if (statusFilter === 'not_whitelisted') {
            result = result.filter((p) => !p.whitelisted);
        }

        if (search) {
            const q = search.toLowerCase();
            result = result.filter((p) => p.username.toLowerCase().includes(q));
        }

        const sorted = [...result];
        sorted.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'username') {
                cmp = a.username.localeCompare(b.username);
            } else if (sortKey === 'role') {
                cmp = (roleOrder[a.role] ?? 99) - (roleOrder[b.role] ?? 99);
            } else if (sortKey === 'status') {
                cmp = Number(a.whitelisted) - Number(b.whitelisted);
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });

        return sorted;
    }, [players, search, statusFilter, sortKey, sortDir]);

    async function addUser() {
        setLoading(true);
        await fetchAction('/admin/whitelist', {
            data: { username, password },
            successMessage: `Added ${username} to whitelist`,
        });
        setLoading(false);
        setShowAdd(false);
        setUsername('');
        setPassword('');
        router.reload({ only: ['players'] });
    }

    function toggleWhitelist(
        target: string,
        isWhitelisted: boolean,
        hasStoredCredentials: boolean,
    ) {
        if (isWhitelisted) {
            setRemoveTarget(target);
        } else if (hasStoredCredentials) {
            // Restore directly using stored bcrypt hash — no password needed
            restoreWhitelist(target);
        } else {
            setPasswordTarget(target);
        }
    }

    async function restoreWhitelist(target: string) {
        setLoading(true);
        await fetchAction(`/admin/whitelist/${target}/toggle`, {
            data: {},
            successMessage: `Whitelisted ${target}`,
        });
        setLoading(false);
        router.reload({ only: ['players'] });
    }

    async function confirmAddToWhitelist() {
        if (!passwordTarget || !password) return;
        setLoading(true);
        await fetchAction(`/admin/whitelist/${passwordTarget}/toggle`, {
            data: { password },
            successMessage: `Whitelisted ${passwordTarget}`,
        });
        setLoading(false);
        setPasswordTarget(null);
        setPassword('');
        router.reload({ only: ['players'] });
    }

    async function confirmRemoveFromWhitelist() {
        if (!removeTarget) return;
        setLoading(true);
        await fetchAction(`/admin/whitelist/${removeTarget}/toggle`, {
            data: {},
            successMessage: `Removed ${removeTarget} from whitelist`,
        });
        setLoading(false);
        setRemoveTarget(null);
        router.reload({ only: ['players'] });
    }

    async function syncWhitelist() {
        setSyncing(true);
        await fetchAction('/admin/whitelist/sync', {
            successMessage: 'Whitelist synced',
        });
        setSyncing(false);
        router.reload({ only: ['players'] });
    }

    async function saveSettings() {
        setSavingSettings(true);
        const result = await fetchAction('/admin/whitelist/settings', {
            method: 'PATCH',
            data: {
                open: !enforceWhitelist,
                auto_create_user_in_whitelist: autoRegister,
            },
            successMessage: 'Whitelist settings updated',
        });
        setSavingSettings(false);
        if (result?.restart_required) {
            setRestartRequired(true);
        }
        router.reload({ only: ['whitelist_settings'] });
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Whitelist Management" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Whitelist Management
                        </h1>
                        <p className="text-muted-foreground">
                            {`${String(whitelistedCount)} of ${String(players.length)} player(s) whitelisted`}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            onClick={syncWhitelist}
                            disabled={syncing}
                        >
                            <RefreshCw
                                className={`mr-1.5 size-4 ${syncing ? 'animate-spin' : ''}`}
                            />
                            Sync
                        </Button>
                        <Button onClick={() => setShowAdd(true)}>
                            <Plus className="mr-1.5 size-4" />
                            Add User to Whitelist
                        </Button>
                    </div>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Settings className="size-5" />
                            Whitelist Settings
                        </CardTitle>
                        <CardDescription>
                            {
                                'Control how the server handles player access and credential storage.'
                            }
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {restartRequired && (
                            <Alert variant="destructive">
                                <AlertTriangle className="size-4" />
                                <AlertDescription>
                                    {
                                        'Settings saved. A server restart is required for changes to take effect.'
                                    }
                                </AlertDescription>
                            </Alert>
                        )}
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="enforce-whitelist">
                                    Whitelist Enforcement
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {
                                        'When enabled, only whitelisted players can join (Open=false).'
                                    }
                                </p>
                            </div>
                            <Switch
                                id="enforce-whitelist"
                                checked={enforceWhitelist}
                                onCheckedChange={setEnforceWhitelist}
                            />
                        </div>
                        <Separator />
                        <div className="flex items-center justify-between">
                            <div className="space-y-0.5">
                                <Label htmlFor="auto-register">
                                    Auto-register Players
                                </Label>
                                <p className="text-sm text-muted-foreground">
                                    {
                                        'Store player credentials when they join. Required for web login sync.'
                                    }
                                </p>
                            </div>
                            <Switch
                                id="auto-register"
                                checked={autoRegister}
                                onCheckedChange={setAutoRegister}
                            />
                        </div>
                        {settingsDirty && (
                            <div className="flex justify-end pt-2">
                                <Button
                                    onClick={saveSettings}
                                    disabled={savingSettings}
                                >
                                    {savingSettings
                                        ? 'Saving...'
                                        : 'Save Settings'}
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2">
                                    <Shield className="size-5" />
                                    All Players
                                </CardTitle>
                                <CardDescription>
                                    {`${String(
                                        filteredPlayers.length,
                                    )} of ${String(players.length)} players`}
                                </CardDescription>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search players..."
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        className="pl-9 sm:w-[200px]"
                                    />
                                </div>
                                <Select
                                    value={statusFilter}
                                    onValueChange={(v) =>
                                        setStatusFilter(v as StatusFilter)
                                    }
                                >
                                    <SelectTrigger className="w-full sm:w-[160px]">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All</SelectItem>
                                        <SelectItem value="whitelisted">
                                            Whitelisted
                                        </SelectItem>
                                        <SelectItem value="not_whitelisted">
                                            Not Whitelisted
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {filteredPlayers.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <button
                                                type="button"
                                                className="flex items-center hover:text-foreground"
                                                onClick={() =>
                                                    toggleSort('username')
                                                }
                                            >
                                                Username
                                                <SortIcon
                                                    column="username"
                                                    sortKey={sortKey}
                                                    sortDir={sortDir}
                                                />
                                            </button>
                                        </TableHead>
                                        <TableHead className="hidden sm:table-cell">
                                            Character
                                        </TableHead>
                                        <TableHead className="hidden sm:table-cell">
                                            <button
                                                type="button"
                                                className="flex items-center hover:text-foreground"
                                                onClick={() =>
                                                    toggleSort('role')
                                                }
                                            >
                                                Role
                                                <SortIcon
                                                    column="role"
                                                    sortKey={sortKey}
                                                    sortDir={sortDir}
                                                />
                                            </button>
                                        </TableHead>
                                        <TableHead>
                                            <button
                                                type="button"
                                                className="flex items-center hover:text-foreground"
                                                onClick={() =>
                                                    toggleSort('status')
                                                }
                                            >
                                                Status
                                                <SortIcon
                                                    column="status"
                                                    sortKey={sortKey}
                                                    sortDir={sortDir}
                                                />
                                            </button>
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Actions
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredPlayers.map((player) => (
                                        <TableRow key={player.username}>
                                            <TableCell className="font-medium">
                                                {player.username}
                                            </TableCell>
                                            <TableCell className="hidden text-muted-foreground sm:table-cell">
                                                {player.character_name &&
                                                player.character_name !==
                                                    player.username
                                                    ? player.character_name
                                                    : '-'}
                                            </TableCell>
                                            <TableCell className="hidden sm:table-cell">
                                                <Badge
                                                    variant={
                                                        roleBadgeVariant[
                                                            player.role
                                                        ] ?? 'outline'
                                                    }
                                                >
                                                    {player.role}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>
                                                {player.whitelisted ? (
                                                    <Badge
                                                        variant="default"
                                                        className="bg-green-600 hover:bg-green-700"
                                                    >
                                                        Whitelisted
                                                    </Badge>
                                                ) : (
                                                    <Badge variant="outline">
                                                        Not Whitelisted
                                                    </Badge>
                                                )}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button
                                                    variant={
                                                        player.whitelisted
                                                            ? 'outline'
                                                            : 'default'
                                                    }
                                                    size="sm"
                                                    onClick={() =>
                                                        toggleWhitelist(
                                                            player.username,
                                                            player.whitelisted,
                                                            player.has_stored_credentials,
                                                        )
                                                    }
                                                >
                                                    {player.whitelisted ? (
                                                        <>
                                                            <ShieldOff className="mr-1.5 size-4" />
                                                            Remove
                                                        </>
                                                    ) : (
                                                        <>
                                                            <Shield className="mr-1.5 size-4" />
                                                            Whitelist
                                                        </>
                                                    )}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="py-8 text-center text-muted-foreground">
                                {search || statusFilter !== 'all'
                                    ? 'No players match your filters'
                                    : 'No players found. Run account sync to discover players.'}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Add New User Dialog */}
            <Dialog open={showAdd} onOpenChange={setShowAdd}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Add User to Whitelist'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Create PZ credentials for a new user. They will use these to join the server.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="wl-username">{'Username'}</Label>
                            <Input
                                id="wl-username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="PZ username"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="wl-password">{'Password'}</Label>
                            <Input
                                id="wl-password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="PZ password"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setShowAdd(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={loading || !username || !password}
                            onClick={addUser}
                        >
                            Add User to Whitelist
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Password Dialog for Whitelisting */}
            <Dialog
                open={passwordTarget !== null}
                onOpenChange={() => {
                    setPasswordTarget(null);
                    setPassword('');
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Set PZ Password'}</DialogTitle>
                        <DialogDescription>
                            {`Set a password for ${passwordTarget ?? ''} to add them to the PZ whitelist.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="toggle-password">{'Password'}</Label>
                        <Input
                            id="toggle-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="PZ password"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setPasswordTarget(null);
                                setPassword('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={loading || !password}
                            onClick={confirmAddToWhitelist}
                        >
                            Add to Whitelist
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Confirm Remove Dialog */}
            <Dialog
                open={removeTarget !== null}
                onOpenChange={() => setRemoveTarget(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Remove from Whitelist'}</DialogTitle>
                        <DialogDescription>
                            {`Remove ${removeTarget ?? ''} from the whitelist? They will no longer be able to join if the server requires whitelist.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setRemoveTarget(null)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={loading}
                            onClick={confirmRemoveFromWhitelist}
                        >
                            Remove
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
