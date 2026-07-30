import { Head, router } from '@inertiajs/react';
import { MoreHorizontal, Pencil, Plus, Power, Trash2 } from 'lucide-react';
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
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useTableSort } from '@/hooks/use-table-sort';
import AppLayout from '@/layouts/app-layout';
import { formatShortDate } from '@/lib/dates';
import { fetchAction } from '@/lib/fetch-action';
import type { BreadcrumbItem } from '@/types';
import type { ShopPromotion } from '@/types/server';

type Props = {
    promotions: ShopPromotion[];
};

type StatusLabel = 'Active' | 'Scheduled' | 'Inactive' | 'Expired';
const statusOrder: Record<StatusLabel, number> = {
    Active: 0,
    Scheduled: 1,
    Inactive: 2,
    Expired: 3,
};

function getPromotionStatus(promo: ShopPromotion): {
    label: StatusLabel;
    variant: 'default' | 'secondary' | 'destructive' | 'outline';
} {
    if (!promo.is_active) return { label: 'Inactive', variant: 'destructive' };
    const now = new Date();
    if (new Date(promo.starts_at) > now)
        return { label: 'Scheduled', variant: 'outline' };
    if (promo.ends_at && new Date(promo.ends_at) < now)
        return { label: 'Expired', variant: 'secondary' };
    return { label: 'Active', variant: 'default' };
}

type SortKey =
    | 'name'
    | 'type'
    | 'value'
    | 'usage_count'
    | 'starts_at'
    | 'status';

export default function ShopPromotions({ promotions }: Props) {
    const [dialogOpen, setDialogOpen] = useState(false);
    const [editPromo, setEditPromo] = useState<ShopPromotion | null>(null);
    const [loading, setLoading] = useState(false);
    const { sortKey, sortDir, toggleSort } = useTableSort<SortKey>(
        'name',
        'asc',
    );

    const [name, setName] = useState('');
    const [code, setCode] = useState('');
    const [type, setType] = useState<'percentage' | 'fixed_amount'>(
        'percentage',
    );
    const [value, setValue] = useState('');
    const [minPurchase, setMinPurchase] = useState('');
    const [maxDiscount, setMaxDiscount] = useState('');
    const [appliesTo, setAppliesTo] = useState<
        'all' | 'category' | 'item' | 'bundle'
    >('all');
    const [usageLimit, setUsageLimit] = useState('');
    const [perUserLimit, setPerUserLimit] = useState('');
    const [startsAt, setStartsAt] = useState('');
    const [endsAt, setEndsAt] = useState('');

    const sortedPromotions = useMemo(() => {
        const sorted = [...promotions];
        sorted.sort((a, b) => {
            let cmp = 0;
            if (sortKey === 'name') {
                cmp = a.name.localeCompare(b.name);
            } else if (sortKey === 'type') {
                cmp = a.type.localeCompare(b.type);
            } else if (sortKey === 'value') {
                cmp = parseFloat(a.value) - parseFloat(b.value);
            } else if (sortKey === 'usage_count') {
                cmp = a.usage_count - b.usage_count;
            } else if (sortKey === 'starts_at') {
                cmp =
                    new Date(a.starts_at).getTime() -
                    new Date(b.starts_at).getTime();
            } else if (sortKey === 'status') {
                const aLabel = getPromotionStatus(a).label;
                const bLabel = getPromotionStatus(b).label;
                cmp = (statusOrder[aLabel] ?? 99) - (statusOrder[bLabel] ?? 99);
            }
            return sortDir === 'desc' ? -cmp : cmp;
        });
        return sorted;
    }, [promotions, sortKey, sortDir]);

    function openCreate() {
        setEditPromo(null);
        setName('');
        setCode('');
        setType('percentage');
        setValue('');
        setMinPurchase('');
        setMaxDiscount('');
        setAppliesTo('all');
        setUsageLimit('');
        setPerUserLimit('');
        setStartsAt(new Date().toISOString().slice(0, 16));
        setEndsAt('');
        setDialogOpen(true);
    }

    function openEdit(promo: ShopPromotion) {
        setEditPromo(promo);
        setName(promo.name);
        setCode(promo.code || '');
        setType(promo.type);
        setValue(promo.value);
        setMinPurchase(promo.min_purchase || '');
        setMaxDiscount(promo.max_discount || '');
        setAppliesTo(promo.applies_to);
        setUsageLimit(promo.usage_limit?.toString() || '');
        setPerUserLimit(promo.per_user_limit?.toString() || '');
        setStartsAt(
            promo.starts_at
                ? new Date(promo.starts_at).toISOString().slice(0, 16)
                : '',
        );
        setEndsAt(
            promo.ends_at
                ? new Date(promo.ends_at).toISOString().slice(0, 16)
                : '',
        );
        setDialogOpen(true);
    }

    async function handleSave() {
        setLoading(true);
        const data: Record<string, unknown> = {
            name,
            code: code || null,
            type,
            value: parseFloat(value),
            min_purchase: minPurchase ? parseFloat(minPurchase) : null,
            max_discount: maxDiscount ? parseFloat(maxDiscount) : null,
            applies_to: appliesTo,
            usage_limit: usageLimit ? parseInt(usageLimit) : null,
            per_user_limit: perUserLimit ? parseInt(perUserLimit) : null,
            starts_at: startsAt,
            ends_at: endsAt || null,
        };

        if (editPromo) {
            await fetchAction(`/admin/shop/promotions/${editPromo.id}`, {
                method: 'PATCH',
                data,
                successMessage: 'Promotion updated',
            });
        } else {
            await fetchAction('/admin/shop/promotions', {
                data,
                successMessage: 'Promotion created',
            });
        }
        setLoading(false);
        setDialogOpen(false);
        router.reload();
    }

    async function handleDelete(promo: ShopPromotion) {
        await fetchAction(`/admin/shop/promotions/${promo.id}`, {
            method: 'DELETE',
            successMessage: 'Promotion deleted',
        });
        router.reload();
    }

    async function handleToggle(promo: ShopPromotion) {
        await fetchAction(`/admin/shop/promotions/${promo.id}/toggle`, {
            successMessage: promo.is_active
                ? 'Promotion deactivated'
                : 'Promotion activated',
        });
        router.reload();
    }

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Shop', href: '/admin/shop' },
        {
            title: 'Promotions',
            href: '/admin/shop/promotions',
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Promotions" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Promotions
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            Manage discount codes and automatic promotions
                        </p>
                    </div>
                    <Button onClick={openCreate}>
                        <Plus className="mr-1.5 size-4" />
                        Create Promotion
                    </Button>
                </div>

                <Card>
                    <CardHeader>
                        <CardTitle>{'All Promotions'}</CardTitle>
                        <CardDescription>
                            {`${String(promotions.length)} promotions`}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {sortedPromotions.length > 0 ? (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>
                                            <SortableHeader
                                                column="name"
                                                label="Name"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>{'Code'}</TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="type"
                                                label="Type"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="value"
                                                label="Value"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>{'Applies To'}</TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="usage_count"
                                                label="Usage"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="starts_at"
                                                label="Date Range"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead>
                                            <SortableHeader
                                                column="status"
                                                label="Status"
                                                sortKey={sortKey}
                                                sortDir={sortDir}
                                                onSort={toggleSort}
                                            />
                                        </TableHead>
                                        <TableHead className="w-[50px]">
                                            <span className="sr-only">
                                                Actions
                                            </span>
                                        </TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {sortedPromotions.map((promo) => {
                                        const status =
                                            getPromotionStatus(promo);
                                        return (
                                            <TableRow key={promo.id}>
                                                <TableCell className="font-medium">
                                                    {promo.name}
                                                </TableCell>
                                                <TableCell>
                                                    {promo.code ? (
                                                        <Badge
                                                            variant="outline"
                                                            className="font-mono text-xs"
                                                        >
                                                            {promo.code}
                                                        </Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">
                                                            &mdash;
                                                        </span>
                                                    )}
                                                </TableCell>
                                                <TableCell className="capitalize">
                                                    {promo.type === 'percentage'
                                                        ? 'percentage'
                                                        : 'fixed amount'}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    {promo.type === 'percentage'
                                                        ? `${parseFloat(promo.value)}%`
                                                        : `${Math.round(parseFloat(promo.value))}`}
                                                </TableCell>
                                                <TableCell className="capitalize">
                                                    {promo.applies_to}
                                                </TableCell>
                                                <TableCell className="tabular-nums">
                                                    {promo.usage_count} /{' '}
                                                    {promo.usage_limit ||
                                                        '\u221E'}
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">
                                                    <div>
                                                        {formatShortDate(
                                                            promo.starts_at,
                                                        )}
                                                    </div>
                                                    {promo.ends_at ? (
                                                        <div>
                                                            {formatShortDate(
                                                                promo.ends_at,
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div>{'No end'}</div>
                                                    )}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge
                                                        variant={status.variant}
                                                        className="text-xs"
                                                    >
                                                        {status.label}
                                                    </Badge>
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
                                                                    handleToggle(
                                                                        promo,
                                                                    )
                                                                }
                                                            >
                                                                <Power className="mr-2 size-4" />
                                                                {promo.is_active
                                                                    ? 'Deactivate'
                                                                    : 'Activate'}
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                onClick={() =>
                                                                    openEdit(
                                                                        promo,
                                                                    )
                                                                }
                                                            >
                                                                <Pencil className="mr-2 size-4" />
                                                                Edit
                                                            </DropdownMenuItem>
                                                            <DropdownMenuItem
                                                                variant="destructive"
                                                                onClick={() =>
                                                                    handleDelete(
                                                                        promo,
                                                                    )
                                                                }
                                                            >
                                                                <Trash2 className="mr-2 size-4" />
                                                                Delete
                                                            </DropdownMenuItem>
                                                        </DropdownMenuContent>
                                                    </DropdownMenu>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        ) : (
                            <p className="py-8 text-center text-muted-foreground">
                                No promotions yet.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {editPromo ? 'Edit Promotion' : 'Create Promotion'}
                        </DialogTitle>
                        <DialogDescription>
                            {editPromo
                                ? 'Update promotion details.'
                                : 'Create a new discount promotion.'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{'Name'}</Label>
                                <Input
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{'Code (optional)'}</Label>
                                <Input
                                    placeholder="e.g. SAVE20"
                                    value={code}
                                    onChange={(e) =>
                                        setCode(e.target.value.toUpperCase())
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{'Type'}</Label>
                                <Select
                                    value={type}
                                    onValueChange={(v) =>
                                        setType(
                                            v as 'percentage' | 'fixed_amount',
                                        )
                                    }
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="percentage">
                                            Percentage
                                        </SelectItem>
                                        <SelectItem value="fixed_amount">
                                            Fixed Amount
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label>{'Value'}</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0.01}
                                    value={value}
                                    onChange={(e) => setValue(e.target.value)}
                                    placeholder={
                                        type === 'percentage'
                                            ? 'e.g. 20'
                                            : 'e.g. 50.00'
                                    }
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>{'Applies To'}</Label>
                            <Select
                                value={appliesTo}
                                onValueChange={(v) =>
                                    setAppliesTo(v as typeof appliesTo)
                                }
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">
                                        All Items
                                    </SelectItem>
                                    <SelectItem value="category">
                                        Category
                                    </SelectItem>
                                    <SelectItem value="item">
                                        Specific Item
                                    </SelectItem>
                                    <SelectItem value="bundle">
                                        Bundle
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{'Min Purchase'}</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    placeholder="None"
                                    value={minPurchase}
                                    onChange={(e) =>
                                        setMinPurchase(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{'Max Discount'}</Label>
                                <Input
                                    type="number"
                                    step="0.01"
                                    min={0}
                                    placeholder="None"
                                    value={maxDiscount}
                                    onChange={(e) =>
                                        setMaxDiscount(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{'Usage Limit'}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Unlimited"
                                    value={usageLimit}
                                    onChange={(e) =>
                                        setUsageLimit(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{'Per User Limit'}</Label>
                                <Input
                                    type="number"
                                    min={1}
                                    placeholder="Unlimited"
                                    value={perUserLimit}
                                    onChange={(e) =>
                                        setPerUserLimit(e.target.value)
                                    }
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>{'Starts At'}</Label>
                                <Input
                                    type="datetime-local"
                                    value={startsAt}
                                    onChange={(e) =>
                                        setStartsAt(e.target.value)
                                    }
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>{'Ends At (optional)'}</Label>
                                <Input
                                    type="datetime-local"
                                    value={endsAt}
                                    onChange={(e) => setEndsAt(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDialogOpen(false)}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={!name || !value || !startsAt || loading}
                            onClick={handleSave}
                        >
                            {editPromo ? 'Update' : 'Create'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
