import { Head, router } from '@inertiajs/react';
import { Coins, MoreHorizontal, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { SortableHeader } from '@/components/sortable-header';
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { useTableSort } from '@/hooks/use-table-sort';
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';
import type { WalletTransaction, WalletUser } from '@/types/server';

type Props = {
    users: WalletUser[];
};

function coin(v: string | number): number {
    return Math.round(typeof v === 'string' ? parseFloat(v) : v);
}

type SortKey = 'username' | 'balance' | 'total_earned' | 'total_spent';

export default function Wallets({ users }: Props) {
    const [filter, setFilter] = useState('');
    const [creditOpen, setCreditOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<WalletUser | null>(null);
    const [amount, setAmount] = useState('');
    const [description, setDescription] = useState('');
    const [loading, setLoading] = useState(false);
    const [txOpen, setTxOpen] = useState(false);
    const [txUser, setTxUser] = useState<WalletUser | null>(null);
    const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
    const [resetOpen, setResetOpen] = useState(false);
    const [resetUser, setResetUser] = useState<WalletUser | null>(null);
    const [resetLoading, setResetLoading] = useState(false);
    const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>(
        'username',
        'asc',
    );

    const filteredUsers = useMemo(() => {
        let result = users;
        if (filter) {
            const q = filter.toLowerCase();
            result = result.filter(
                (u) =>
                    u.username.toLowerCase().includes(q) ||
                    u.name?.toLowerCase().includes(q),
            );
        }
        const sorted = [...result];
        sorted.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'username') {
                cmp = a.username.localeCompare(b.username);
            } else if (sortKey === 'balance') {
                cmp = a.balance - b.balance;
            } else if (sortKey === 'total_earned') {
                cmp = a.total_earned - b.total_earned;
            } else if (sortKey === 'total_spent') {
                cmp = a.total_spent - b.total_spent;
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
        return sorted;
    }, [users, filter, sortKey, sortDir]);

    const totalBalance = useMemo(
        () => users.reduce((sum, u) => sum + u.balance, 0),
        [users],
    );

    function openCredit(user: WalletUser) {
        setSelectedUser(user);
        setAmount('');
        setDescription('');
        setCreditOpen(true);
    }

    async function handleCredit() {
        if (!selectedUser) return;
        setLoading(true);
        await fetchAction(`/admin/wallets/${selectedUser.id}/credit`, {
            data: {
                amount: parseFloat(amount),
                description: description || null,
            },
            successMessage: `Awarded ${amount} to ${selectedUser.username}`,
        });
        setLoading(false);
        setCreditOpen(false);
        router.reload();
    }

    function openReset(user: WalletUser) {
        setResetUser(user);
        setResetOpen(true);
    }

    async function handleReset() {
        if (!resetUser) return;
        setResetLoading(true);
        await fetchAction(`/admin/wallets/${resetUser.id}/reset`, {
            successMessage: `${resetUser.username}'s balance has been reset to 0`,
        });
        setResetLoading(false);
        setResetOpen(false);
        router.reload();
    }

    async function viewTransactions(user: WalletUser) {
        setTxUser(user);
        setTxOpen(true);
        try {
            const res = await fetch(`/admin/wallets/${user.id}/transactions`, {
                headers: { Accept: 'application/json' },
            });
            const data = await res.json();
            setTransactions(data.transactions?.data || []);
        } catch {
            setTransactions([]);
        }
    }

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Wallets', href: '/admin/wallets' },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Player Wallets" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Player Wallets
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        Manage player currency balances
                    </p>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <Coins className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold tabular-nums">
                                    {coin(totalBalance)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Total in Circulation
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <Coins className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {users.length}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Total Players
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <Coins className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold tabular-nums">
                                    {users.length > 0
                                        ? coin(totalBalance / users.length)
                                        : 0}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Average Balance
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle>{'All Players'}</CardTitle>
                                <CardDescription>
                                    {`${String(filteredUsers.length)} players`}
                                </CardDescription>
                            </div>
                            <div className="relative">
                                <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search players..."
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="pl-9 sm:w-[250px]"
                                />
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {filteredUsers.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <SortableHeader
                                                column="username"
                                                label="Username"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <SortableHeader
                                                column="balance"
                                                label="Balance"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <SortableHeader
                                                column="total_earned"
                                                label="Total Earned"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <SortableHeader
                                                column="total_spent"
                                                label="Total Spent"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="w-[60px]" />
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredUsers.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <span className="font-medium">
                                                    {user.username}
                                                </span>
                                                {user.name &&
                                                    user.name !==
                                                        user.username && (
                                                        <p className="text-xs text-muted-foreground">
                                                            {user.name}
                                                        </p>
                                                    )}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {coin(user.balance)}
                                            </TableCell>
                                            <TableCell className="text-right text-green-600 tabular-nums">
                                                {coin(user.total_earned)}
                                            </TableCell>
                                            <TableCell className="text-right text-red-600 tabular-nums">
                                                {coin(user.total_spent)}
                                            </TableCell>
                                            <TableCell>
                                                <DropdownMenu>
                                                    <DropdownMenuTrigger
                                                        asChild
                                                    >
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            className="size-8"
                                                        >
                                                            <MoreHorizontal className="size-4" />
                                                            <span className="sr-only">
                                                                Actions
                                                            </span>
                                                        </Button>
                                                    </DropdownMenuTrigger>
                                                    <DropdownMenuContent align="end">
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                openCredit(user)
                                                            }
                                                        >
                                                            Award
                                                        </DropdownMenuItem>
                                                        <DropdownMenuItem
                                                            onClick={() =>
                                                                viewTransactions(
                                                                    user,
                                                                )
                                                            }
                                                        >
                                                            History
                                                        </DropdownMenuItem>
                                                        {user.balance > 0 && (
                                                            <>
                                                                <DropdownMenuSeparator />
                                                                <DropdownMenuItem
                                                                    variant="destructive"
                                                                    onClick={() =>
                                                                        openReset(
                                                                            user,
                                                                        )
                                                                    }
                                                                >
                                                                    {
                                                                        'Reset Balance'
                                                                    }
                                                                </DropdownMenuItem>
                                                            </>
                                                        )}
                                                    </DropdownMenuContent>
                                                </DropdownMenu>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="py-8 text-center text-muted-foreground">
                                No players found.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Award Currency Dialog */}
            <Dialog open={creditOpen} onOpenChange={setCreditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Award Currency'}</DialogTitle>
                        <DialogDescription>
                            {`Award currency to ${selectedUser?.username ?? ''}'s wallet.`}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>{'Amount'}</Label>
                            <Input
                                type="number"
                                step="1"
                                min={1}
                                value={amount}
                                onChange={(e) => setAmount(e.target.value)}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>{'Description (optional)'}</Label>
                            <Textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="e.g. Welcome bonus"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setCreditOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                !amount || parseFloat(amount) <= 0 || loading
                            }
                            onClick={handleCredit}
                        >
                            Award
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reset Balance Dialog */}
            <Dialog open={resetOpen} onOpenChange={setResetOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{'Reset Balance'}</DialogTitle>
                        <DialogDescription>
                            {`This will set ${resetUser?.username ?? ''}'s balance to 0. Current balance: ${String(
                                resetUser ? coin(resetUser.balance) : 0,
                            )}. This action cannot be undone.`}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setResetOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={resetLoading}
                            onClick={handleReset}
                        >
                            Reset to 0
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Transaction History Dialog */}
            <Dialog open={txOpen} onOpenChange={setTxOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{'Transaction History'}</DialogTitle>
                        <DialogDescription>
                            {txUser?.username}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {transactions.length > 0 ? (
                            <div className="space-y-2">
                                {transactions.map((tx) => (
                                    <div
                                        key={tx.id}
                                        className="flex items-center justify-between rounded-md border border-border/50 px-3 py-2"
                                    >
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <Badge
                                                    variant={
                                                        tx.type === 'credit'
                                                            ? 'default'
                                                            : tx.type ===
                                                                'refund'
                                                              ? 'outline'
                                                              : 'destructive'
                                                    }
                                                    className="text-xs"
                                                >
                                                    {tx.type}
                                                </Badge>
                                                <span className="text-xs text-muted-foreground">
                                                    {tx.source}
                                                </span>
                                            </div>
                                            {tx.description && (
                                                <p className="mt-0.5 text-xs text-muted-foreground">
                                                    {tx.description}
                                                </p>
                                            )}
                                        </div>
                                        <div className="text-right">
                                            <span
                                                className={`text-sm font-medium tabular-nums ${
                                                    tx.type === 'credit' ||
                                                    tx.type === 'refund'
                                                        ? 'text-green-600'
                                                        : 'text-red-600'
                                                }`}
                                            >
                                                {tx.type === 'debit'
                                                    ? '-'
                                                    : '+'}
                                                {coin(tx.amount)}
                                            </span>
                                            <p className="text-xs text-muted-foreground tabular-nums">
                                                {`Bal: ${String(
                                                    coin(tx.balance_after),
                                                )}`}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="py-8 text-center text-sm text-muted-foreground">
                                No transactions yet.
                            </p>
                        )}
                    </div>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
