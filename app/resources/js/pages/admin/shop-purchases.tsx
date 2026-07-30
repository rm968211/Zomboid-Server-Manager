import { Head, router } from '@inertiajs/react';
import { Coins, Package, Search, ShoppingBag } from 'lucide-react';
import { useState } from 'react';
import { Pagination } from '@/components/pagination';
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
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { useServerSort } from '@/hooks/use-server-sort';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime } from '@/lib/dates';
import type { BreadcrumbItem } from '@/types';
import type { ShopDelivery, ShopPurchase } from '@/types/server';

type PurchaseUser = {
    id: number;
    username: string;
    name: string;
};

type AdminPurchase = ShopPurchase & {
    user?: PurchaseUser;
};

type PaginatedData<T> = {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    links: Array<{ url: string | null; label: string; active: boolean }>;
};

type Props = {
    purchases: PaginatedData<AdminPurchase>;
    stats: {
        total_revenue: number;
        total_purchases: number;
        items_sold: number;
    };
    filters: {
        search: string;
        status: string;
        sort: string;
        direction: string;
    };
};

const statusColors: Record<string, string> = {
    pending:
        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300',
    queued: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300',
    delivered:
        'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
    partially_delivered:
        'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300',
    failed: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
};

type SortKey =
    | 'total_price'
    | 'quantity_bought'
    | 'created_at'
    | 'delivery_status';

function coin(v: string | number): number {
    return Math.round(typeof v === 'string' ? parseFloat(v) : v);
}

function StatusBadge({ status }: { status: string }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[status] || ''}`}
        >
            {status.replace('_', ' ')}
        </span>
    );
}

function getPurchasableName(purchase: AdminPurchase): string {
    if (purchase.purchasable) {
        return purchase.purchasable.name;
    }
    if (purchase.metadata && typeof purchase.metadata === 'object') {
        const meta = purchase.metadata as Record<string, unknown>;
        if (typeof meta.name === 'string') return meta.name;
        if (Array.isArray(meta.items)) {
            return (meta.items as Array<{ name?: string }>)
                .map((i) => i.name || '?')
                .join(', ');
        }
    }
    return purchase.purchasable_type.includes('Bundle') ? 'Bundle' : 'Item';
}

export default function ShopPurchases({ purchases, stats, filters }: Props) {
    const [search, setSearch] = useState(filters.search);
    const [status, setStatus] = useState(filters.status);
    const { sortKey, sortDir, toggleSort } = useServerSort<SortKey>({
        url: '/admin/shop/purchases',
        filters,
        defaultSort: 'created_at',
        defaultDir: 'desc',
    });

    function applyFilters() {
        const params: Record<string, string> = {};
        if (search) params.search = search;
        if (status) params.status = status;
        if (filters.sort) params.sort = filters.sort;
        if (filters.direction) params.direction = filters.direction;
        router.get('/admin/shop/purchases', params, { preserveState: true });
    }

    function clearFilters() {
        setSearch('');
        setStatus('');
        const params: Record<string, string> = {};
        if (filters.sort) params.sort = filters.sort;
        if (filters.direction) params.direction = filters.direction;
        router.get('/admin/shop/purchases', params, { preserveState: true });
    }

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Shop', href: '/admin/shop' },
        {
            title: 'Purchases',
            href: '/admin/shop/purchases',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Shop Purchases" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">
                        Shop Purchases
                    </h1>
                    <p className="text-sm text-muted-foreground">
                        View and manage all player purchases
                    </p>
                </div>

                {/* Summary cards */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <Coins className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold tabular-nums">
                                    {coin(stats.total_revenue)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Total Revenue
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <ShoppingBag className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {stats.total_purchases}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Total Purchases
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="flex items-center gap-3 pt-6">
                            <Package className="size-5 text-muted-foreground" />
                            <div>
                                <p className="text-2xl font-bold">
                                    {stats.items_sold}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Items Sold
                                </p>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Filters */}
                <Card>
                    <CardHeader>
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <CardTitle>{'All Purchases'}</CardTitle>
                                <CardDescription>
                                    {`${String(purchases.total)} total`}
                                </CardDescription>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search player..."
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        onKeyDown={(e) =>
                                            e.key === 'Enter' && applyFilters()
                                        }
                                        className="pl-9 sm:w-[200px]"
                                    />
                                </div>
                                <Select
                                    value={status}
                                    onValueChange={(v) => {
                                        setStatus(v === 'all' ? '' : v);
                                    }}
                                >
                                    <SelectTrigger className="w-[160px]">
                                        <SelectValue placeholder="All statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">
                                            All statuses
                                        </SelectItem>
                                        <SelectItem value="pending">
                                            Pending
                                        </SelectItem>
                                        <SelectItem value="queued">
                                            Queued
                                        </SelectItem>
                                        <SelectItem value="delivered">
                                            Delivered
                                        </SelectItem>
                                        <SelectItem value="partially_delivered">
                                            Partial
                                        </SelectItem>
                                        <SelectItem value="failed">
                                            Failed
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button size="sm" onClick={applyFilters}>
                                    Filter
                                </Button>
                                {(filters.search || filters.status) && (
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={clearFilters}
                                    >
                                        Clear
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="overflow-x-auto">
                        {purchases.data.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>{'Player'}</TableHead>
                                        <TableHead>{'Item'}</TableHead>
                                        <TableHead className="text-center">
                                            <SortableHeader
                                                column="quantity_bought"
                                                label="Qty"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            <SortableHeader
                                                column="total_price"
                                                label="Price"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="text-right">
                                            Discount
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="delivery_status"
                                                label="Delivery Status"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="created_at"
                                                label="Date"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {purchases.data.map((purchase) => (
                                        <TableRow key={purchase.id}>
                                            <TableCell className="font-medium">
                                                {purchase.user?.username ||
                                                    'Unknown'}
                                            </TableCell>
                                            <TableCell>
                                                {getPurchasableName(purchase)}
                                            </TableCell>
                                            <TableCell className="text-center">
                                                {purchase.quantity_bought}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {coin(purchase.total_price)}
                                            </TableCell>
                                            <TableCell className="text-right tabular-nums">
                                                {purchase.discount_amount &&
                                                parseFloat(
                                                    purchase.discount_amount,
                                                ) > 0 ? (
                                                    <span className="text-green-600">
                                                        -
                                                        {coin(
                                                            purchase.discount_amount,
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="text-muted-foreground">
                                                        &mdash;
                                                    </span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex flex-col gap-1">
                                                    <StatusBadge
                                                        status={
                                                            purchase.delivery_status
                                                        }
                                                    />
                                                    {purchase.deliveries &&
                                                        purchase.deliveries
                                                            .length > 0 && (
                                                            <div className="mt-1 flex flex-wrap gap-1">
                                                                {purchase.deliveries.map(
                                                                    (
                                                                        delivery: ShopDelivery,
                                                                    ) => (
                                                                        <Badge
                                                                            key={
                                                                                delivery.id
                                                                            }
                                                                            variant="outline"
                                                                            className="text-xs"
                                                                            title={
                                                                                delivery.error_message ||
                                                                                undefined
                                                                            }
                                                                        >
                                                                            {
                                                                                delivery.item_type
                                                                            }{' '}
                                                                            x
                                                                            {
                                                                                delivery.quantity
                                                                            }{' '}
                                                                            —{' '}
                                                                            {
                                                                                delivery.status
                                                                            }
                                                                            {delivery.error_message &&
                                                                                ' (!)'}
                                                                        </Badge>
                                                                    ),
                                                                )}
                                                            </div>
                                                        )}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                                                {formatDateTime(
                                                    purchase.created_at,
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="py-8 text-center text-muted-foreground">
                                No purchases found.
                            </p>
                        )}

                        {/* Pagination */}
                        <Pagination
                            currentPage={purchases.current_page}
                            lastPage={purchases.last_page}
                            links={purchases.links}
                        />
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
