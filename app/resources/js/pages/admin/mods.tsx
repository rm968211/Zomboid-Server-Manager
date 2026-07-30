import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Head, router, usePoll } from '@inertiajs/react';
import {
    AlertTriangle,
    Bookmark,
    BookmarkPlus,
    Boxes,
    CheckCircle2,
    Clock,
    Download,
    FileUp,
    GripVertical,
    Layers,
    Loader2,
    Package,
    Pencil,
    Plus,
    RotateCcw,
    Search,
    Star,
    Trash2,
    Unlink,
    X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslation } from '@/hooks/use-translation';
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import { parseModImport } from '@/lib/parse-mod-import';
import type {
    BreadcrumbItem,
    BuildCompat,
    ModBundles,
    ModEntry,
    WorkshopDetails,
} from '@/types';

type LookupResult = {
    found: boolean;
    workshop_id: string;
    title?: string;
    preview_url?: string | null;
    mod_ids?: string[];
    map_folders?: string[];
    is_bundle?: boolean;
    members?: string[];
};

type LookupState =
    | { status: 'idle' }
    | { status: 'loading' }
    | {
          status: 'success';
          title: string;
          previewUrl: string | null;
          modIds: string[];
          mapFolders: string[];
      }
    | { status: 'not_found' }
    | {
          status: 'no_mod_ids';
          title: string;
          previewUrl: string | null;
          mapFolders: string[];
      }
    | {
          status: 'bundle';
          title: string;
          previewUrl: string | null;
          members: string[];
      }
    | { status: 'error' };

function StatusBadge({ status }: { status: ModEntry['status'] }) {
    const { t } = useTranslation();

    if (status === 'active') {
        return (
            <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                data-testid="mod-status-active"
            >
                <CheckCircle2 className="size-3" />
                {t('admin.mods.status_active')}
            </Badge>
        );
    }

    if (status === 'pending_restart') {
        return (
            <Badge
                variant="outline"
                className="gap-1 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                data-testid="mod-status-pending"
            >
                <Clock className="size-3" />
                {t('admin.mods.status_pending')}
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="gap-1 text-muted-foreground"
            data-testid="mod-status-stopped"
        >
            {t('admin.mods.status_stopped')}
        </Badge>
    );
}

/**
 * A mod's Workshop items, tolerating rows from older responses that only ever
 * carried the single scanned `workshop_id`.
 */
function modWorkshopIds(mod: ModEntry): string[] {
    if (mod.workshop_ids) {
        return mod.workshop_ids;
    }

    return mod.workshop_id ? [mod.workshop_id] : [];
}

function workshopUrl(workshopId: string): string {
    return `https://steamcommunity.com/sharedfiles/filedetails/?id=${workshopId}`;
}

function fmtSize(bytes: number): string {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
}

function fmtDate(unixSeconds: number): string {
    return new Date(unixSeconds * 1000).toLocaleDateString(undefined, {
        month: 'short',
        year: 'numeric',
    });
}

function CompatBadge({ compat }: { compat?: BuildCompat }) {
    const { t } = useTranslation();

    if (!compat) {
        return null;
    }

    if (compat === 'b42') {
        return (
            <Badge
                variant="outline"
                className="border-emerald-500/40 bg-emerald-500/10 text-xs text-emerald-700 dark:text-emerald-400"
                data-testid="compat-b42"
            >
                {t('admin.mods.compat_b42')}
            </Badge>
        );
    }

    if (compat === 'b41') {
        return (
            <Badge
                variant="outline"
                className="border-rose-500/40 bg-rose-500/10 text-xs text-rose-700 dark:text-rose-400"
                data-testid="compat-b41"
            >
                {t('admin.mods.compat_b41')}
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="text-xs text-muted-foreground"
            data-testid="compat-unknown"
        >
            {t('admin.mods.compat_unknown')}
        </Badge>
    );
}

function ModThumb({
    src,
    className = 'size-10',
}: {
    src?: string | null;
    className?: string;
}) {
    return (
        <div
            className={`relative shrink-0 overflow-hidden rounded-md bg-muted ${className}`}
        >
            <Package className="absolute inset-0 m-auto size-4 text-muted-foreground" />
            {src && (
                <img
                    src={src}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover"
                    onError={(e) => e.currentTarget.remove()}
                />
            )}
        </div>
    );
}

function ModMeta({ details }: { details: WorkshopDetails }) {
    const { t } = useTranslation();

    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {details.subscriptions != null && (
                <span className="flex items-center gap-1">
                    <Star className="size-3" />
                    {details.subscriptions.toLocaleString()}
                </span>
            )}
            {details.time_updated != null && (
                <span>
                    {t('admin.mods.meta_updated', {
                        date: fmtDate(details.time_updated),
                    })}
                </span>
            )}
            {details.file_size != null && details.file_size > 0 && (
                <span>{fmtSize(details.file_size)}</span>
            )}
        </div>
    );
}

type GroupPosition = 'solo' | 'start' | 'middle' | 'end';
type GroupInfo = { position: GroupPosition; siblings: string[] };

/**
 * Editable list of the Workshop items one mod needs. Used both when adding a
 * mod and when correcting an existing one, so the two never drift apart.
 */
function WorkshopIdEditor({
    ids,
    onChange,
    details,
    lockedIds = [],
}: {
    ids: string[];
    onChange: (ids: string[]) => void;
    details: Record<string, WorkshopDetails | null>;
    /** IDs that identify the mod itself and so can't be dropped here. */
    lockedIds?: string[];
}) {
    const { t } = useTranslation();
    const [draft, setDraft] = useState('');

    const trimmed = draft.trim();
    const canAdd = /^\d{1,20}$/.test(trimmed) && !ids.includes(trimmed);

    function commit() {
        if (!canAdd) {
            return;
        }
        onChange([...ids, trimmed]);
        setDraft('');
    }

    return (
        <div className="space-y-2" data-testid="workshop-id-editor">
            {ids.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                    {ids.map((id) => (
                        <Badge
                            key={id}
                            variant="secondary"
                            className="max-w-full gap-1 text-xs"
                            data-testid="workshop-id-chip"
                        >
                            <span className="truncate">
                                {details[id]?.title || id}
                            </span>
                            {!lockedIds.includes(id) && (
                                <button
                                    type="button"
                                    onClick={() =>
                                        onChange(ids.filter((x) => x !== id))
                                    }
                                    aria-label={t(
                                        'admin.mods.workshop_id_remove',
                                        { id },
                                    )}
                                    className="text-muted-foreground hover:text-foreground"
                                >
                                    <X className="size-3" />
                                </button>
                            )}
                        </Badge>
                    ))}
                </div>
            ) : (
                <p className="text-xs text-muted-foreground">
                    {t('admin.mods.workshop_ids_empty')}
                </p>
            )}
            <div className="flex gap-2">
                <Input
                    inputMode="numeric"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            commit();
                        }
                    }}
                    placeholder={t('admin.mods.workshop_id_placeholder')}
                    data-testid="workshop-id-draft"
                />
                <Button
                    type="button"
                    variant="outline"
                    disabled={!canAdd}
                    onClick={commit}
                    data-testid="workshop-id-add"
                >
                    <Plus className="size-4" />
                </Button>
            </div>
        </div>
    );
}

/** A row's membership in a Steam Workshop collection the admin tracks. */
type BundleInfo = {
    bundleId: string;
    title: string;
    /** How many rows of the current list belong to this bundle. */
    count: number;
    /** First row of this bundle in the current list — carries the badge. */
    isFirst: boolean;
};

/**
 * Badge marking a row as part of a tracked Workshop collection, with the
 * escape hatch: unbundling leaves every mod exactly where it is and stops
 * treating them as one unit.
 */
function BundleBadge({
    bundle,
    onUnbundle,
}: {
    bundle: BundleInfo;
    onUnbundle: (bundleId: string) => void;
}) {
    const { t } = useTranslation();

    return (
        <span className="inline-flex items-center gap-1">
            <Badge
                variant="outline"
                className="gap-1 border-sky-500/40 bg-sky-500/10 text-xs text-sky-700 dark:text-sky-400"
                data-testid="bundle-badge"
            >
                <Boxes className="size-3" />
                {t('admin.mods.bundle_badge', {
                    title: bundle.title,
                    count: String(bundle.count),
                })}
            </Badge>
            <Tooltip>
                <TooltipTrigger asChild>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto px-1 py-0.5 text-xs text-muted-foreground"
                        onClick={() => onUnbundle(bundle.bundleId)}
                        data-testid="unbundle-button"
                    >
                        <Unlink className="size-3" />
                    </Button>
                </TooltipTrigger>
                <TooltipContent>{t('admin.mods.unbundle')}</TooltipContent>
            </Tooltip>
        </span>
    );
}

/**
 * A single Workshop item can bundle several mods (e.g. one upload containing
 * seven sub-mods) — they're installed as consecutive `Mods=` entries. This
 * clusters visually-adjacent rows sharing a workshop_id into a group, without
 * reordering anything: load order (and drag-to-reorder) stays exactly as-is,
 * so a bundle only *looks* grouped when its members happen to still be next
 * to each other.
 */
function computeGroups(mods: ModEntry[]): GroupInfo[] {
    const result: GroupInfo[] = new Array(mods.length);
    let i = 0;

    while (i < mods.length) {
        // An unresolved workshop_id ('') never groups with anything — treat
        // it as its own solo run and move on. Without this, the inner scan
        // below (which starts comparing at `i` itself) never advances past
        // an empty-string workshop_id, since '' is falsy, looping forever.
        if (!mods[i].workshop_id) {
            result[i] = { position: 'solo', siblings: [] };
            i++;
            continue;
        }

        let j = i + 1;
        while (j < mods.length && mods[j].workshop_id === mods[i].workshop_id) {
            j++;
        }

        const runLength = j - i;
        const siblings =
            runLength > 1 ? mods.slice(i, j).map((m) => m.mod_id) : [];

        for (let k = i; k < j; k++) {
            const position: GroupPosition =
                runLength === 1
                    ? 'solo'
                    : k === i
                      ? 'start'
                      : k === j - 1
                        ? 'end'
                        : 'middle';
            result[k] = { position, siblings };
        }

        i = j;
    }

    return result;
}

/**
 * Flatten the bundle → members map the server sends into a member → bundle
 * lookup. A Workshop item claimed by two collections is attributed to whichever
 * comes first; the grouping is presentational, so a stable pick is enough.
 */
function invertBundles(bundles: ModBundles): Map<string, string> {
    const byMember = new Map<string, string>();

    Object.entries(bundles).forEach(([bundleId, members]) => {
        members.forEach((member) => {
            if (!byMember.has(member)) {
                byMember.set(member, bundleId);
            }
        });
    });

    return byMember;
}

/**
 * Reorder a wishlist so every bundle's members sit together, anchored at the
 * position of whichever member came first. Unlike the installed list — where
 * row order IS the PZ load order and must not be touched — wishlist order
 * carries no meaning beyond the chosen sort, so clustering is free.
 */
function clusterByBundle<T extends { id: string }>(
    entries: T[],
    bundleOf: Map<string, string>,
): T[] {
    const emitted = new Set<string>();
    const clustered: T[] = [];

    entries.forEach((entry) => {
        const bundleId = bundleOf.get(entry.id);

        if (!bundleId) {
            clustered.push(entry);

            return;
        }

        if (emitted.has(bundleId)) {
            return;
        }

        emitted.add(bundleId);
        clustered.push(
            ...entries.filter((e) => bundleOf.get(e.id) === bundleId),
        );
    });

    return clustered;
}

/**
 * Every currently installed mod that transitively requires `modId` — mirrors
 * ModManager::transitiveDependents() so the delete dialog can preview exactly
 * what a cascade will remove before the request is sent.
 */
function computeTransitiveDependents(
    mods: ModEntry[],
    modId: string,
): string[] {
    const requiredByMap: Record<string, string[]> = {};
    mods.forEach((m) => {
        requiredByMap[m.mod_id] = m.required_by ?? [];
    });

    const seen = new Set<string>();
    const queue = [...(requiredByMap[modId] ?? [])];

    while (queue.length > 0) {
        const id = queue.shift() as string;
        if (seen.has(id)) continue;
        seen.add(id);
        (requiredByMap[id] ?? []).forEach((next) => queue.push(next));
    }

    return [...seen];
}

function SortableModRow({
    mod,
    index,
    onDelete,
    isDragDisabled,
    isProtected,
    details,
    group,
    installedModIds,
    bundle,
    onUnbundle,
    onEditWorkshopIds,
}: {
    mod: ModEntry;
    index: number;
    onDelete: (mod: ModEntry) => void;
    isDragDisabled: boolean;
    isProtected: boolean;
    group: GroupInfo;
    installedModIds: Set<string>;
    details?: WorkshopDetails | null;
    bundle?: BundleInfo;
    onUnbundle: (bundleId: string) => void;
    onEditWorkshopIds: (mod: ModEntry) => void;
}) {
    const { t } = useTranslation();
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({
        // mod_id is the unique key — a single Workshop item can bundle several
        // mods sharing one workshop_id, which dnd-kit can't use as a sortable id.
        id: mod.mod_id,
        disabled: isDragDisabled,
    });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : undefined,
    };

    const isGrouped = group.position !== 'solo';
    const isContinuation =
        group.position === 'middle' || group.position === 'end';
    // Distinguish "still fetching" (undefined) from "fetched, not found on
    // Steam" (null) — only the former gets a skeleton. A blank workshop_id
    // is never fetched at all, so it doesn't get a perpetual skeleton either.
    const isLoadingDetails = mod.workshop_id !== '' && details === undefined;
    const workshopIds = modWorkshopIds(mod);
    const requires = mod.requires ?? [];
    const missingRequires = requires.filter((r) => !installedModIds.has(r));
    const requiredBy = mod.required_by ?? [];
    const blocked = requiredBy.length > 0;

    return (
        <TableRow
            ref={setNodeRef}
            style={style}
            className={[
                isDragging ? 'bg-muted' : '',
                bundle
                    ? 'border-l-2 border-l-sky-500/60'
                    : isGrouped
                      ? 'border-l-2 border-l-primary/40'
                      : '',
            ]
                .filter(Boolean)
                .join(' ')}
            data-testid={bundle ? 'bundled-mod-row' : undefined}
        >
            <TableCell className="w-[50px]">
                {!isDragDisabled ? (
                    <button
                        type="button"
                        aria-label={`Reorder ${mod.mod_id}`}
                        className="cursor-grab touch-none text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
                        {...attributes}
                        {...listeners}
                    >
                        <GripVertical className="size-4" />
                    </button>
                ) : (
                    <span className="font-mono text-xs text-muted-foreground">
                        {index + 1}
                    </span>
                )}
            </TableCell>
            <TableCell className="font-medium">
                {isContinuation ? (
                    <div className="flex items-center gap-2 pl-6 text-muted-foreground">
                        <span aria-hidden="true">↳</span>
                        <span className="truncate font-mono text-xs">
                            {mod.mod_id}
                        </span>
                        {isProtected && (
                            <Badge variant="outline" className="text-xs">
                                {t('admin.mods.required_badge')}
                            </Badge>
                        )}
                    </div>
                ) : isLoadingDetails ? (
                    <div
                        className="flex items-center gap-3"
                        data-testid="mod-row-loading"
                    >
                        <Skeleton className="size-10 shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <Skeleton className="h-4 w-2/3" />
                            <Skeleton className="h-3 w-1/3" />
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-3">
                        <ModThumb src={details?.preview_url} />
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                {details?.title ? (
                                    <a
                                        href={workshopUrl(mod.workshop_id)}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="truncate hover:underline"
                                    >
                                        {details.title}
                                    </a>
                                ) : (
                                    <span className="truncate">
                                        {mod.mod_id}
                                    </span>
                                )}
                                {isProtected && (
                                    <Badge
                                        variant="outline"
                                        className="text-xs"
                                    >
                                        {t('admin.mods.required_badge')}
                                    </Badge>
                                )}
                                <CompatBadge compat={details?.build_compat} />
                                {group.position === 'start' && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge
                                                variant="outline"
                                                className="gap-1 text-xs"
                                                data-testid="multimod-badge"
                                            >
                                                <Layers className="size-3" />
                                                {t(
                                                    'admin.mods.multimod_badge',
                                                    {
                                                        count: String(
                                                            group.siblings
                                                                .length,
                                                        ),
                                                    },
                                                )}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {group.siblings.join(', ')}
                                        </TooltipContent>
                                    </Tooltip>
                                )}
                                {bundle?.isFirst && (
                                    <BundleBadge
                                        bundle={bundle}
                                        onUnbundle={onUnbundle}
                                    />
                                )}
                            </div>
                            <div className="truncate font-mono text-xs text-muted-foreground">
                                {mod.mod_id}
                            </div>
                            {details && (
                                <div className="hidden md:block">
                                    <ModMeta details={details} />
                                </div>
                            )}
                        </div>
                    </div>
                )}
                {requires.length > 0 && (
                    <div
                        className={`mt-1 truncate text-xs ${missingRequires.length > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}
                    >
                        {missingRequires.length > 0 && (
                            <AlertTriangle className="mr-1 inline size-3" />
                        )}
                        {t('admin.mods.requires_label', {
                            mods: requires.join(', '),
                        })}
                    </div>
                )}
                {blocked && (
                    <div className="mt-1 truncate text-xs text-amber-600 dark:text-amber-400">
                        {t('admin.mods.required_by_label', {
                            mods: requiredBy.join(', '),
                        })}
                    </div>
                )}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
                <div className="flex flex-wrap gap-1">
                    {workshopIds.length > 0 ? (
                        workshopIds.map((id) => (
                            <Badge
                                key={id}
                                variant="secondary"
                                className="text-xs"
                            >
                                {id}
                            </Badge>
                        ))
                    ) : (
                        <Badge
                            variant="outline"
                            className="text-xs text-muted-foreground"
                            data-testid="workshop-id-missing"
                        >
                            {t('admin.mods.workshop_id_unknown')}
                        </Badge>
                    )}
                </div>
            </TableCell>
            <TableCell>
                <StatusBadge status={mod.status} />
            </TableCell>
            <TableCell className="text-right">
                <div className="flex items-center justify-end gap-1">
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditWorkshopIds(mod)}
                                data-testid="edit-workshop-ids"
                            >
                                <Pencil className="size-4" />
                            </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                            {t('admin.mods.edit_workshop_ids')}
                        </TooltipContent>
                    </Tooltip>
                    {!isProtected && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => onDelete(mod)}
                        >
                            <Trash2 className="size-4" />
                        </Button>
                    )}
                </div>
            </TableCell>
        </TableRow>
    );
}

export default function Mods({
    mods,
    protectedWorkshopIds = [],
    pendingRestart = false,
    serverStatus = 'offline',
    wishlist = [],
    bundles = {},
}: {
    mods: ModEntry[];
    protectedWorkshopIds?: string[];
    pendingRestart?: boolean;
    serverStatus?: 'offline' | 'starting' | 'online';
    wishlist?: string[];
    bundles?: ModBundles;
}) {
    const { t } = useTranslation();
    const protectedSet = useMemo(
        () => new Set(protectedWorkshopIds),
        [protectedWorkshopIds],
    );

    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('nav.dashboard'), href: '/dashboard' },
        { title: t('admin.mods.title'), href: '/admin/mods' },
    ];
    const [showAdd, setShowAdd] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<ModEntry | null>(null);
    const [workshopId, setWorkshopId] = useState('');
    const [modId, setModId] = useState('');
    const [mapFolder, setMapFolder] = useState('');
    const [loading, setLoading] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [search, setSearch] = useState('');
    const [orderedMods, setOrderedMods] = useState(mods);
    const deleteCascade = useMemo(
        () =>
            deleteTarget
                ? computeTransitiveDependents(orderedMods, deleteTarget.mod_id)
                : [],
        [orderedMods, deleteTarget],
    );
    const [lookup, setLookup] = useState<LookupState>({ status: 'idle' });
    const [manualOverride, setManualOverride] = useState(false);
    const lookupTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lookupAbort = useRef<AbortController | null>(null);

    const [view, setView] = useState<'installed' | 'wishlist'>('installed');
    const [details, setDetails] = useState<
        Record<string, WorkshopDetails | null>
    >({});
    const [bundleDeleteTarget, setBundleDeleteTarget] = useState<{
        bundleId: string;
        target: 'installed' | 'wishlist';
    } | null>(null);
    /** Extra Workshop items the mod being added needs, beyond the primary one. */
    const [addWorkshopIds, setAddWorkshopIds] = useState<string[]>([]);
    const [editTarget, setEditTarget] = useState<ModEntry | null>(null);
    const [editWorkshopIds, setEditWorkshopIds] = useState<string[]>([]);
    const [wishSort, setWishSort] = useState<'added' | 'b42'>('added');
    const [showWish, setShowWish] = useState(false);
    const [wishId, setWishId] = useState('');
    const [wishLoading, setWishLoading] = useState(false);
    const [pendingInstall, setPendingInstall] = useState<string | null>(null);
    const [showWishlistBulk, setShowWishlistBulk] = useState(false);
    const [wishlistBulkText, setWishlistBulkText] = useState('');
    const [wishlistBulkImporting, setWishlistBulkImporting] = useState(false);

    const existingWorkshopIds = useMemo(
        () => new Set(mods.map((m) => m.workshop_id).filter(Boolean)),
        [mods],
    );
    // Read inside the debounced lookup without making it a dependency, which
    // would re-run the Steam lookup every time the mod list changes.
    const existingModIdsRef = useRef<Set<string>>(new Set());
    const existingModIds = useMemo(
        () => new Set(mods.map((m) => m.mod_id).filter(Boolean)),
        [mods],
    );
    useEffect(() => {
        existingModIdsRef.current = existingModIds;
    }, [existingModIds]);

    /** Blocks the Add button — a repeated `Mods=` entry is a real fault. */
    const isDuplicateMod = modId !== '' && existingModIds.has(modId);
    const wishDuplicate = existingWorkshopIds.has(wishId.trim())
        ? 'installed'
        : wishlist.includes(wishId.trim())
          ? 'wishlisted'
          : null;

    const bundleOf = useMemo(() => invertBundles(bundles), [bundles]);
    const bundleTitle = useCallback(
        (bundleId: string) => details[bundleId]?.title || bundleId,
        [details],
    );

    /**
     * Resolve a row's bundle badge against the list it is rendered in, so the
     * count reflects what's actually visible (installed vs wishlisted) rather
     * than the collection's full size on Steam.
     */
    const bundleInfoIn = useCallback(
        (rows: string[][], index: number): BundleInfo | undefined => {
            const bundleIdOf = (ids: string[]) =>
                ids.map((id) => bundleOf.get(id)).find(Boolean);

            const bundleId = bundleIdOf(rows[index]);

            if (!bundleId) {
                return undefined;
            }

            const memberRows = rows
                .map((ids, i) => (bundleIdOf(ids) === bundleId ? i : -1))
                .filter((i) => i >= 0);

            return {
                bundleId,
                title: bundleTitle(bundleId),
                count: memberRows.length,
                isFirst: memberRows[0] === index,
            };
        },
        [bundleOf, bundleTitle],
    );

    const [showBulk, setShowBulk] = useState(false);
    const [bulkText, setBulkText] = useState('');
    const [bulkPhase, setBulkPhase] = useState<'input' | 'resolving' | 'ready'>(
        'input',
    );
    const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
    const [bulkWorkshopIds, setBulkWorkshopIds] = useState<string[]>([]);
    const [bulkModIds, setBulkModIds] = useState<string[]>([]);
    const [bulkMapFolders, setBulkMapFolders] = useState<string[]>([]);
    const [bulkUnresolved, setBulkUnresolved] = useState<string[]>([]);
    const [bulkBundleIds, setBulkBundleIds] = useState<string[]>([]);
    const [importing, setImporting] = useState(false);
    const bulkCancelled = useRef(false);

    const isFiltering = search.length > 0;

    const bulkNewMods = bulkModIds.filter((m) => !existingModIds.has(m)).length;
    const bulkNewWorkshop = bulkWorkshopIds.filter(
        (w) => !existingWorkshopIds.has(w),
    ).length;
    const bulkHasSomething =
        bulkModIds.length > 0 ||
        bulkWorkshopIds.length > 0 ||
        bulkBundleIds.length > 0;

    function openBulk() {
        bulkCancelled.current = false;
        setBulkText('');
        setBulkPhase('input');
        setBulkProgress({ done: 0, total: 0 });
        setBulkWorkshopIds([]);
        setBulkModIds([]);
        setBulkMapFolders([]);
        setBulkUnresolved([]);
        setBulkBundleIds([]);
        setShowBulk(true);
    }

    function closeBulk() {
        bulkCancelled.current = true;
        setShowBulk(false);
    }

    async function prepareBulk() {
        const parsed = parseModImport(bulkText);
        setBulkMapFolders(parsed.mapFolders);

        if (parsed.mode === 'ini') {
            setBulkWorkshopIds(parsed.workshopIds);
            setBulkModIds(parsed.modIds);
            setBulkUnresolved([]);
            setBulkBundleIds([]);
            setBulkPhase('ready');
            return;
        }

        // IDs-only: resolve each Workshop ID's mod IDs via the Steam lookup endpoint.
        // A single Workshop item can provide several mods, so collect them all.
        bulkCancelled.current = false;
        setBulkPhase('resolving');
        setBulkProgress({ done: 0, total: parsed.workshopIds.length });

        const workshopIds: string[] = [];
        const modIds: string[] = [];
        const mapFolders: string[] = [...parsed.mapFolders];
        const unresolved: string[] = [];
        const bundleIds: string[] = [];

        for (let i = 0; i < parsed.workshopIds.length; i++) {
            if (bulkCancelled.current) {
                return;
            }
            const id = parsed.workshopIds[i];
            const json = (await fetchAction('/admin/mods/lookup', {
                data: { workshop_id: id },
                silent: true,
            })) as LookupResult | null;

            // Collections carry no mods of their own — hand them to the bundle
            // endpoint at submit time, which expands and records them serverside.
            if (json?.is_bundle && (json.members ?? []).length > 0) {
                bundleIds.push(id);
                setBulkProgress({
                    done: i + 1,
                    total: parsed.workshopIds.length,
                });
                continue;
            }

            const ids = json?.mod_ids ?? [];
            if (json && json.found !== false && ids.length > 0) {
                workshopIds.push(id);
                modIds.push(...ids);
                if (json.map_folders) {
                    mapFolders.push(...json.map_folders);
                }
            } else {
                unresolved.push(id);
            }
            setBulkProgress({ done: i + 1, total: parsed.workshopIds.length });
        }

        if (bulkCancelled.current) {
            return;
        }
        setBulkWorkshopIds(workshopIds);
        setBulkModIds(modIds);
        setBulkMapFolders(mapFolders);
        setBulkUnresolved(unresolved);
        setBulkBundleIds(bundleIds);
        setBulkPhase('ready');
    }

    async function submitBulk() {
        setImporting(true);

        const hasPlainMods =
            bulkWorkshopIds.length > 0 || bulkModIds.length > 0;

        let succeeded = false;

        if (hasPlainMods) {
            succeeded = Boolean(
                await fetchAction('/admin/mods/import', {
                    data: {
                        workshop_ids: bulkWorkshopIds,
                        mod_ids: bulkModIds,
                        map: bulkMapFolders,
                    },
                    successMessage: t('admin.mods.bulk_toast_imported', {
                        count: String(
                            bulkModIds.length || bulkWorkshopIds.length,
                        ),
                    }),
                }),
            );
        }

        for (const bundleId of bulkBundleIds) {
            const installed = await fetchAction('/admin/mods/bundles', {
                data: { workshop_id: bundleId, target: 'installed' },
                successMessage: t('admin.mods.toast_bundle_installed', {
                    title: bundleId,
                }),
            });
            succeeded = succeeded || Boolean(installed);
        }

        setImporting(false);
        if (succeeded) {
            closeBulk();
            router.reload({
                only: ['mods', 'bundles', 'pendingRestart', 'serverStatus'],
            });
        }
    }

    useEffect(() => {
        setOrderedMods(mods);
    }, [mods]);

    // A restart is underway from the click until the container reports healthy
    // again. `restarting` only covers the gap before the deferred restart takes
    // effect; after that the container's own 'starting' state is the truth, and
    // it survives a page reload where local state wouldn't.
    const restartInProgress = restarting || serverStatus === 'starting';

    const { start: startStatusPoll, stop: stopStatusPoll } = usePoll(
        5000,
        { only: ['mods', 'pendingRestart', 'serverStatus'] },
        { autoStart: false, keepAlive: true },
    );

    // Only poll while something is actually changing — the mod list is static
    // otherwise, and each poll costs a Docker call plus a Workshop dir scan.
    useEffect(() => {
        if (restartInProgress) {
            startStatusPoll();
        } else {
            stopStatusPoll();
        }
    }, [restartInProgress, startStatusPoll, stopStatusPoll]);

    // Hand off from the local flag once the container has visibly restarted, so
    // a restart that never took (rejected, or the container never went down)
    // can't leave the button spinning forever.
    useEffect(() => {
        if (restarting && (serverStatus === 'starting' || !pendingRestart)) {
            setRestarting(false);
        }
    }, [restarting, serverStatus, pendingRestart]);

    // Batch-fetch Workshop metadata (title, thumbnail, build compat, stats)
    // for every installed + wishlisted mod that we haven't resolved yet.
    useEffect(() => {
        const wanted = new Set<string>(wishlist);
        mods.forEach((m) => modWorkshopIds(m).forEach((id) => wanted.add(id)));
        // Chips in the add/edit editors show a title once resolved.
        addWorkshopIds.forEach((id) => wanted.add(id));
        editWorkshopIds.forEach((id) => wanted.add(id));
        // Bundles are Workshop items too — their title and thumbnail come from
        // the same batch, and members previewed in the add dialog need theirs.
        Object.keys(bundles).forEach((id) => wanted.add(id));
        if (lookup.status === 'bundle') {
            lookup.members.forEach((id) => wanted.add(id));
        }
        const missing = [...wanted].filter((id) => !(id in details));
        if (missing.length === 0) {
            return;
        }

        let cancelled = false;
        (async () => {
            const json = (await fetchAction('/admin/mods/details', {
                data: { workshop_ids: missing },
                silent: true,
            })) as {
                details?: Record<string, WorkshopDetails | null>;
            } | null;
            if (cancelled) {
                return;
            }
            // Every requested id must resolve to something (even null) —
            // otherwise a failed or partial response leaves it permanently
            // `undefined`, which now renders as a skeleton that never clears.
            const resolved = Object.fromEntries(
                missing.map((id) => [id, json?.details?.[id] ?? null]),
            );
            setDetails((prev) => ({ ...prev, ...resolved }));
        })();

        return () => {
            cancelled = true;
        };
    }, [
        mods,
        wishlist,
        details,
        bundles,
        lookup,
        addWorkshopIds,
        editWorkshopIds,
    ]);

    const sortedWishlist = useMemo(() => {
        // Keep `undefined` (still loading) distinct from `null` (fetched,
        // not found on Steam) so the row can show a skeleton vs. a fallback.
        const entries = wishlist.map((id) => ({
            id,
            details: details[id],
        }));
        if (wishSort === 'b42') {
            const rank: Record<BuildCompat, number> = {
                b42: 0,
                unknown: 1,
                b41: 2,
            };
            return clusterByBundle(
                [...entries].sort(
                    (a, b) =>
                        rank[a.details?.build_compat ?? 'unknown'] -
                        rank[b.details?.build_compat ?? 'unknown'],
                ),
                bundleOf,
            );
        }
        return clusterByBundle(entries, bundleOf);
    }, [wishlist, details, wishSort, bundleOf]);

    const wishlistIds = useMemo(
        () => sortedWishlist.map((e) => [e.id]),
        [sortedWishlist],
    );

    const resetLookupState = useCallback(() => {
        setLookup({ status: 'idle' });
        setModId('');
        setMapFolder('');
        setManualOverride(false);
    }, []);

    const runLookup = useCallback(async (rawId: string) => {
        const trimmed = rawId.trim();
        if (!/^\d{1,20}$/.test(trimmed)) {
            setLookup({ status: 'idle' });
            return;
        }

        lookupAbort.current?.abort();
        const controller = new AbortController();
        lookupAbort.current = controller;
        setLookup({ status: 'loading' });

        const json = (await fetchAction('/admin/mods/lookup', {
            data: { workshop_id: trimmed },
            silent: true,
            signal: controller.signal,
        })) as LookupResult | null;

        if (controller.signal.aborted) return;

        // fetchAction returns null on transport / non-2xx failures.
        // The "not found" case is structured by the backend as 404 + {found:false},
        // which fetchAction collapses to null too — treat both the same.
        if (!json) {
            setLookup({ status: 'not_found' });
            setModId('');
            setMapFolder('');
            setManualOverride(true);
            return;
        }

        if (json.found === false) {
            setLookup({ status: 'not_found' });
            setModId('');
            setMapFolder('');
            setManualOverride(true);
            return;
        }

        const modIds = json.mod_ids ?? [];
        const mapFolders = json.map_folders ?? [];
        const title = json.title ?? '';
        const previewUrl = json.preview_url ?? null;

        // A collection has no Mod IDs of its own — it's installed by expanding
        // it, so the dialog switches to bundle mode instead of asking for one.
        if (json.is_bundle && (json.members ?? []).length > 0) {
            setLookup({
                status: 'bundle',
                title,
                previewUrl,
                members: json.members ?? [],
            });
            setModId('');
            setMapFolder('');
            setManualOverride(false);

            return;
        }

        if (modIds.length === 0) {
            setLookup({ status: 'no_mod_ids', title, previewUrl, mapFolders });
            setModId('');
            setMapFolder(mapFolders[0] ?? '');
            setManualOverride(true);
            return;
        }

        setLookup({ status: 'success', title, previewUrl, modIds, mapFolders });
        // One Workshop upload can provide several mods, and you often already
        // have some of them — start on one that isn't installed so the dialog
        // opens ready to submit rather than blocked on a duplicate.
        setModId(
            modIds.find((id) => !existingModIdsRef.current.has(id)) ??
                modIds[0],
        );
        setMapFolder(mapFolders[0] ?? '');
        setManualOverride(false);
    }, []);

    useEffect(() => {
        if (!showAdd) {
            return;
        }
        if (lookupTimer.current) {
            clearTimeout(lookupTimer.current);
        }
        const trimmed = workshopId.trim();
        if (trimmed === '') {
            resetLookupState();
            return;
        }
        lookupTimer.current = setTimeout(() => {
            runLookup(trimmed);
        }, 400);
        return () => {
            if (lookupTimer.current) clearTimeout(lookupTimer.current);
        };
    }, [workshopId, showAdd, runLookup, resetLookupState]);

    const filteredMods = useMemo(() => {
        if (!search) return orderedMods;
        const q = search.toLowerCase();
        return orderedMods.filter(
            (m) =>
                m.mod_id.toLowerCase().includes(q) ||
                m.workshop_id.toLowerCase().includes(q) ||
                (details[m.workshop_id]?.title ?? '').toLowerCase().includes(q),
        );
    }, [orderedMods, search, details]);

    // Filtering can split a bundle apart (only some of its mods match the
    // search), so groups are recomputed against whatever's currently visible
    // rather than the full list — a partially-filtered bundle just renders
    // as standalone rows instead of a broken-looking group.
    const modGroups = useMemo(
        () => computeGroups(filteredMods),
        [filteredMods],
    );

    const filteredWorkshopIds = useMemo(
        () => filteredMods.map(modWorkshopIds),
        [filteredMods],
    );

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        }),
    );

    async function handleDragEnd(event: DragEndEvent) {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        const oldIndex = orderedMods.findIndex((m) => m.mod_id === active.id);
        const newIndex = orderedMods.findIndex((m) => m.mod_id === over.id);
        const reordered = arrayMove(orderedMods, oldIndex, newIndex);

        setOrderedMods(reordered);

        await fetchAction('/admin/mods/order', {
            method: 'PUT',
            data: {
                mods: reordered.map((m) => ({
                    workshop_id: m.workshop_id,
                    mod_id: m.mod_id,
                })),
            },
            successMessage: t('admin.mods.toast_order_updated'),
        });

        router.reload({ only: ['mods', 'pendingRestart', 'serverStatus'] });
    }

    async function restartServer() {
        setRestarting(true);
        const started = await fetchAction('/admin/server/restart', {
            method: 'POST',
            successMessage: t('admin.mods.toast_restart_started'),
        });
        // The request only *queues* the restart (the controller defers the
        // container work until after it responds), so keep the busy state until
        // polling sees the container actually go down — clearing it here would
        // put "Restart server" back in front of the user mid-restart.
        if (!started) {
            setRestarting(false);
        }
        router.reload({ only: ['mods', 'pendingRestart', 'serverStatus'] });
    }

    function closeAddDialog() {
        setShowAdd(false);
        setWorkshopId('');
        setPendingInstall(null);
        setAddWorkshopIds([]);
        resetLookupState();
    }

    function openEditWorkshopIds(mod: ModEntry) {
        setEditTarget(mod);
        setEditWorkshopIds(modWorkshopIds(mod));
    }

    async function saveWorkshopIds() {
        if (!editTarget) {
            return;
        }

        setLoading(true);
        const result = await fetchAction('/admin/mods/workshop-ids', {
            method: 'PUT',
            data: {
                mod_id: editTarget.mod_id,
                workshop_ids: editWorkshopIds,
            },
            successMessage: t('admin.mods.toast_workshop_ids_updated', {
                mod_id: editTarget.mod_id,
            }),
        });
        setLoading(false);

        if (result) {
            setEditTarget(null);
            router.reload({
                only: ['mods', 'bundles', 'pendingRestart', 'serverStatus'],
            });
        }
    }

    async function addMod() {
        setLoading(true);
        const result = await fetchAction('/admin/mods', {
            data: {
                workshop_id: workshopId,
                workshop_ids: [workshopId.trim(), ...addWorkshopIds],
                mod_id: modId,
                map_folder: mapFolder || null,
            },
            successMessage: t('admin.mods.toast_added', { mod_id: modId }),
        });
        // Installing a wishlisted mod removes it from the wishlist.
        if (result && pendingInstall === workshopId.trim()) {
            await fetchAction(`/admin/mods/wishlist/${pendingInstall}`, {
                method: 'DELETE',
                silent: true,
            });
        }
        setLoading(false);
        closeAddDialog();
        router.reload({
            only: ['mods', 'wishlist', 'pendingRestart', 'serverStatus'],
        });
    }

    async function removeMod(mod: ModEntry, toWishlist = false) {
        setLoading(true);
        // A mod with no matching WorkshopItems= entry has workshop_id === '',
        // which would collapse the URL to /admin/mods (no DELETE route). The
        // backend looks the mod up by mod_id in the body when present, so the
        // path segment just needs to be non-empty.
        const result = await fetchAction(
            `/admin/mods/${mod.workshop_id || 'unresolved'}`,
            {
                method: 'DELETE',
                // Disambiguates which row to remove when several mods share
                // one Workshop item (a single Workshop upload can bundle
                // multiple mods).
                data: { mod_id: mod.mod_id },
                successMessage: toWishlist
                    ? t('admin.mods.toast_moved_to_wishlist', {
                          mod_id: mod.mod_id,
                      })
                    : t('admin.mods.toast_removed', {
                          mod_id: mod.mod_id,
                      }),
            },
        );
        if (result && toWishlist) {
            await fetchAction('/admin/mods/wishlist', {
                data: { workshop_id: mod.workshop_id },
                silent: true,
            });
        }
        setLoading(false);
        setDeleteTarget(null);
        router.reload({
            only: ['mods', 'wishlist', 'pendingRestart', 'serverStatus'],
        });
    }

    /**
     * Install every mod in a collection. Also used from the wishlist, where a
     * bundled row's Install button installs the whole bundle rather than the
     * one mod the button happens to sit on.
     */
    async function installBundle(bundleId: string) {
        setLoading(true);
        const result = await fetchAction('/admin/mods/bundles', {
            data: { workshop_id: bundleId, target: 'installed' },
            successMessage: t('admin.mods.toast_bundle_installed', {
                title: bundleTitle(bundleId),
            }),
        });
        setLoading(false);
        if (result) {
            closeAddDialog();
            router.reload({
                only: [
                    'mods',
                    'wishlist',
                    'bundles',
                    'pendingRestart',
                    'serverStatus',
                ],
            });
        }
    }

    async function removeBundle(
        bundleId: string,
        target: 'installed' | 'wishlist',
        toWishlist = false,
    ) {
        setLoading(true);
        await fetchAction(`/admin/mods/bundles/${bundleId}/mods`, {
            method: 'DELETE',
            data: { target, to_wishlist: toWishlist },
            successMessage: toWishlist
                ? t('admin.mods.toast_bundle_moved_to_wishlist', {
                      title: bundleTitle(bundleId),
                  })
                : t('admin.mods.toast_bundle_removed', {
                      title: bundleTitle(bundleId),
                  }),
        });
        setLoading(false);
        setBundleDeleteTarget(null);
        router.reload({
            only: [
                'mods',
                'wishlist',
                'bundles',
                'pendingRestart',
                'serverStatus',
            ],
        });
    }

    async function unbundle(bundleId: string) {
        await fetchAction(`/admin/mods/bundles/${bundleId}`, {
            method: 'DELETE',
            successMessage: t('admin.mods.toast_unbundled', {
                title: bundleTitle(bundleId),
            }),
        });
        router.reload({ only: ['bundles'] });
    }

    async function addWish() {
        setWishLoading(true);
        const result = await fetchAction('/admin/mods/wishlist', {
            data: { workshop_id: wishId.trim() },
            successMessage: t('admin.mods.toast_wishlist_added'),
        });
        setWishLoading(false);
        if (result) {
            setShowWish(false);
            setWishId('');
            router.reload({ only: ['wishlist'] });
        }
    }

    async function removeWish(id: string) {
        await fetchAction(`/admin/mods/wishlist/${id}`, {
            method: 'DELETE',
            successMessage: t('admin.mods.toast_wishlist_removed'),
        });
        router.reload({ only: ['wishlist'] });
    }

    function installFromWishlist(id: string) {
        setPendingInstall(id);
        setWorkshopId(id);
        setShowAdd(true);
    }

    function openWishlistBulk() {
        setWishlistBulkText('');
        setShowWishlistBulk(true);
    }

    function closeWishlistBulk() {
        setShowWishlistBulk(false);
    }

    const wishlistBulkIds = useMemo(
        () => parseModImport(wishlistBulkText).workshopIds,
        [wishlistBulkText],
    );

    async function submitWishlistBulk() {
        if (wishlistBulkIds.length === 0) {
            return;
        }

        setWishlistBulkImporting(true);
        const result = (await fetchAction('/admin/mods/wishlist/import', {
            data: { workshop_ids: wishlistBulkIds },
            successMessage: t('admin.mods.wishlist_bulk_toast_imported', {
                count: String(wishlistBulkIds.length),
            }),
        })) as { added?: string[]; skipped?: number } | null;
        setWishlistBulkImporting(false);

        if (result) {
            closeWishlistBulk();
            router.reload({ only: ['wishlist'] });
        }
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('admin.mods.title')} />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            {t('admin.mods.title')}
                        </h1>
                        <p className="text-muted-foreground">
                            {t('admin.mods.mods_installed', {
                                count: String(mods.length),
                            })}
                        </p>
                    </div>
                    <div className="flex gap-2">
                        {view === 'installed' ? (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={openBulk}
                                    data-testid="bulk-import-button"
                                >
                                    <FileUp className="mr-1.5 size-4" />
                                    {t('admin.mods.bulk_import')}
                                </Button>
                                <Button onClick={() => setShowAdd(true)}>
                                    <Plus className="mr-1.5 size-4" />
                                    {t('admin.mods.add_mod')}
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={openWishlistBulk}
                                    data-testid="wishlist-bulk-import-button"
                                >
                                    <FileUp className="mr-1.5 size-4" />
                                    {t('admin.mods.bulk_import')}
                                </Button>
                                <Button
                                    onClick={() => setShowWish(true)}
                                    data-testid="wishlist-mod-button"
                                >
                                    <BookmarkPlus className="mr-1.5 size-4" />
                                    {t('admin.mods.wishlist_mod')}
                                </Button>
                            </>
                        )}
                    </div>
                </div>

                <ToggleGroup
                    type="single"
                    variant="outline"
                    value={view}
                    onValueChange={(v) => {
                        if (v === 'installed' || v === 'wishlist') {
                            setView(v);
                        }
                    }}
                    className="self-start"
                >
                    <ToggleGroupItem
                        value="installed"
                        data-testid="tab-installed"
                    >
                        <Package className="mr-1.5 size-4" />
                        {t('admin.mods.tab_installed')} ({mods.length})
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="wishlist"
                        data-testid="tab-wishlist"
                    >
                        <Bookmark className="mr-1.5 size-4" />
                        {t('admin.mods.tab_wishlist')} ({wishlist.length})
                    </ToggleGroupItem>
                </ToggleGroup>

                {view === 'installed' && (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Package className="size-5" />
                                        {t('admin.mods.installed_mods')}
                                    </CardTitle>
                                    <CardDescription>
                                        {t(
                                            'admin.mods.installed_mods_description',
                                            {
                                                filtered: String(
                                                    filteredMods.length,
                                                ),
                                                total: String(mods.length),
                                            },
                                        )}
                                    </CardDescription>
                                </div>
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                                    <Input
                                        placeholder={t(
                                            'admin.mods.search_placeholder',
                                        )}
                                        value={search}
                                        onChange={(e) =>
                                            setSearch(e.target.value)
                                        }
                                        className="pl-9 sm:w-[200px]"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {(pendingRestart || restartInProgress) && (
                                <Alert
                                    className="mb-4 border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600"
                                    data-testid="pending-restart-banner"
                                >
                                    {restartInProgress ? (
                                        <Loader2 className="size-4 animate-spin" />
                                    ) : (
                                        <AlertTriangle className="size-4" />
                                    )}
                                    <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <span>
                                            {restartInProgress
                                                ? t(
                                                      'admin.mods.restart_in_progress',
                                                  )
                                                : t(
                                                      'admin.mods.pending_restart_banner',
                                                  )}
                                        </span>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={
                                                restartInProgress ||
                                                serverStatus === 'offline'
                                            }
                                            onClick={restartServer}
                                            data-testid="restart-server-button"
                                        >
                                            <RotateCcw
                                                className={`mr-1.5 size-4 ${restartInProgress ? 'animate-spin' : ''}`}
                                            />
                                            {restartInProgress
                                                ? t('admin.mods.restarting')
                                                : t('admin.mods.restart_now')}
                                        </Button>
                                    </AlertDescription>
                                </Alert>
                            )}
                            {filteredMods.length > 0 ? (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-[50px]">
                                                    {isFiltering ? '#' : ''}
                                                </TableHead>
                                                <TableHead>
                                                    {t(
                                                        'admin.mods.table_mod_id',
                                                    )}
                                                </TableHead>
                                                <TableHead className="hidden sm:table-cell">
                                                    {t(
                                                        'admin.mods.table_workshop_id',
                                                    )}
                                                </TableHead>
                                                <TableHead>
                                                    {t(
                                                        'admin.mods.table_status',
                                                    )}
                                                </TableHead>
                                                <TableHead className="text-right">
                                                    {t('common.actions')}
                                                </TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <SortableContext
                                            items={filteredMods.map(
                                                (m) => m.mod_id,
                                            )}
                                            strategy={
                                                verticalListSortingStrategy
                                            }
                                        >
                                            <TableBody>
                                                {filteredMods.map(
                                                    (mod, index) => (
                                                        <SortableModRow
                                                            key={mod.mod_id}
                                                            mod={mod}
                                                            index={index}
                                                            onDelete={(m) => {
                                                                const bundleId =
                                                                    modWorkshopIds(
                                                                        m,
                                                                    )
                                                                        .map(
                                                                            (
                                                                                id,
                                                                            ) =>
                                                                                bundleOf.get(
                                                                                    id,
                                                                                ),
                                                                        )
                                                                        .find(
                                                                            Boolean,
                                                                        );
                                                                if (bundleId) {
                                                                    setBundleDeleteTarget(
                                                                        {
                                                                            bundleId,
                                                                            target: 'installed',
                                                                        },
                                                                    );
                                                                } else {
                                                                    setDeleteTarget(
                                                                        m,
                                                                    );
                                                                }
                                                            }}
                                                            isDragDisabled={
                                                                isFiltering
                                                            }
                                                            isProtected={protectedSet.has(
                                                                mod.workshop_id,
                                                            )}
                                                            details={
                                                                details[
                                                                    mod
                                                                        .workshop_id
                                                                ]
                                                            }
                                                            group={
                                                                modGroups[index]
                                                            }
                                                            installedModIds={
                                                                existingModIds
                                                            }
                                                            bundle={bundleInfoIn(
                                                                filteredWorkshopIds,
                                                                index,
                                                            )}
                                                            onUnbundle={
                                                                unbundle
                                                            }
                                                            onEditWorkshopIds={
                                                                openEditWorkshopIds
                                                            }
                                                        />
                                                    ),
                                                )}
                                            </TableBody>
                                        </SortableContext>
                                    </Table>
                                </DndContext>
                            ) : (
                                <p className="py-8 text-center text-muted-foreground">
                                    {search
                                        ? t('admin.mods.no_mods_search')
                                        : t('admin.mods.no_mods')}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}

                {view === 'wishlist' && (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Bookmark className="size-5" />
                                        {t('admin.mods.wishlist_title')}
                                    </CardTitle>
                                    <CardDescription>
                                        {t('admin.mods.wishlist_description', {
                                            count: String(wishlist.length),
                                        })}
                                    </CardDescription>
                                </div>
                                <Select
                                    value={wishSort}
                                    onValueChange={(v) =>
                                        setWishSort(v as 'added' | 'b42')
                                    }
                                >
                                    <SelectTrigger
                                        className="sm:w-[200px]"
                                        data-testid="wishlist-sort"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="added">
                                            {t('admin.mods.sort_added')}
                                        </SelectItem>
                                        <SelectItem value="b42">
                                            {t('admin.mods.sort_b42')}
                                        </SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {sortedWishlist.length > 0 ? (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>
                                                {t('admin.mods.table_mod')}
                                            </TableHead>
                                            <TableHead className="hidden sm:table-cell">
                                                {t(
                                                    'admin.mods.table_workshop_id',
                                                )}
                                            </TableHead>
                                            <TableHead>
                                                {t('admin.mods.table_b42')}
                                            </TableHead>
                                            <TableHead className="text-right">
                                                {t('common.actions')}
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedWishlist.map(
                                            ({ id, details: d }, index) => {
                                                const installed =
                                                    existingWorkshopIds.has(id);
                                                const isLoadingDetails =
                                                    d === undefined;
                                                const bundle = bundleInfoIn(
                                                    wishlistIds,
                                                    index,
                                                );
                                                return (
                                                    <TableRow
                                                        key={id}
                                                        data-testid="wishlist-row"
                                                        className={
                                                            bundle
                                                                ? 'border-l-2 border-l-sky-500/60'
                                                                : undefined
                                                        }
                                                    >
                                                        <TableCell className="font-medium">
                                                            {isLoadingDetails ? (
                                                                <div
                                                                    className="flex items-center gap-3"
                                                                    data-testid="wishlist-row-loading"
                                                                >
                                                                    <Skeleton className="size-12 shrink-0" />
                                                                    <div className="min-w-0 flex-1 space-y-1.5">
                                                                        <Skeleton className="h-4 w-2/3" />
                                                                        <Skeleton className="h-3 w-1/3" />
                                                                    </div>
                                                                </div>
                                                            ) : (
                                                                <div className="flex items-center gap-3">
                                                                    <ModThumb
                                                                        src={
                                                                            d?.preview_url
                                                                        }
                                                                        className="size-12"
                                                                    />
                                                                    <div className="min-w-0">
                                                                        <div className="flex items-center gap-2">
                                                                            <a
                                                                                href={workshopUrl(
                                                                                    id,
                                                                                )}
                                                                                target="_blank"
                                                                                rel="noreferrer"
                                                                                className="block truncate hover:underline"
                                                                            >
                                                                                {d?.title ||
                                                                                    id}
                                                                            </a>
                                                                            {bundle?.isFirst && (
                                                                                <BundleBadge
                                                                                    bundle={
                                                                                        bundle
                                                                                    }
                                                                                    onUnbundle={
                                                                                        unbundle
                                                                                    }
                                                                                />
                                                                            )}
                                                                        </div>
                                                                        {d && (
                                                                            <ModMeta
                                                                                details={
                                                                                    d
                                                                                }
                                                                            />
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="hidden sm:table-cell">
                                                            <Badge
                                                                variant="secondary"
                                                                className="text-xs"
                                                            >
                                                                {id}
                                                            </Badge>
                                                        </TableCell>
                                                        <TableCell>
                                                            {!isLoadingDetails && (
                                                                <CompatBadge
                                                                    compat={
                                                                        d?.build_compat ??
                                                                        'unknown'
                                                                    }
                                                                />
                                                            )}
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <div className="flex items-center justify-end gap-1">
                                                                {installed ? (
                                                                    <Badge
                                                                        variant="outline"
                                                                        className="text-xs text-muted-foreground"
                                                                    >
                                                                        {t(
                                                                            'admin.mods.already_installed',
                                                                        )}
                                                                    </Badge>
                                                                ) : (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        disabled={
                                                                            loading
                                                                        }
                                                                        onClick={() =>
                                                                            bundle
                                                                                ? installBundle(
                                                                                      bundle.bundleId,
                                                                                  )
                                                                                : installFromWishlist(
                                                                                      id,
                                                                                  )
                                                                        }
                                                                        data-testid="wishlist-install"
                                                                    >
                                                                        <Download className="mr-1.5 size-4" />
                                                                        {bundle
                                                                            ? t(
                                                                                  'admin.mods.install_bundle',
                                                                                  {
                                                                                      count: String(
                                                                                          bundle.count,
                                                                                      ),
                                                                                  },
                                                                              )
                                                                            : t(
                                                                                  'admin.mods.install',
                                                                              )}
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive hover:text-destructive"
                                                                    onClick={() =>
                                                                        bundle
                                                                            ? setBundleDeleteTarget(
                                                                                  {
                                                                                      bundleId:
                                                                                          bundle.bundleId,
                                                                                      target: 'wishlist',
                                                                                  },
                                                                              )
                                                                            : removeWish(
                                                                                  id,
                                                                              )
                                                                    }
                                                                    data-testid="wishlist-remove"
                                                                >
                                                                    <Trash2 className="size-4" />
                                                                </Button>
                                                            </div>
                                                        </TableCell>
                                                    </TableRow>
                                                );
                                            },
                                        )}
                                    </TableBody>
                                </Table>
                            ) : (
                                <p className="py-8 text-center text-muted-foreground">
                                    {t('admin.mods.no_wishlist')}
                                </p>
                            )}
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Add Mod Dialog */}
            <Dialog
                open={showAdd}
                onOpenChange={(open) =>
                    open ? setShowAdd(true) : closeAddDialog()
                }
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.add_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.add_dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="workshop-id">
                                {t('admin.mods.table_workshop_id')}
                            </Label>
                            <div className="relative">
                                <Input
                                    id="workshop-id"
                                    inputMode="numeric"
                                    value={workshopId}
                                    onChange={(e) =>
                                        setWorkshopId(e.target.value)
                                    }
                                    placeholder={t(
                                        'admin.mods.workshop_id_placeholder',
                                    )}
                                    data-testid="workshop-id-input"
                                />
                                {lookup.status === 'loading' && (
                                    <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                            {(lookup.status === 'success' ||
                                lookup.status === 'no_mod_ids' ||
                                lookup.status === 'bundle') && (
                                <div
                                    className="flex items-center gap-3 rounded-md border bg-muted/30 p-2"
                                    data-testid="workshop-preview"
                                >
                                    {lookup.previewUrl && (
                                        <img
                                            src={lookup.previewUrl}
                                            alt=""
                                            className="size-10 rounded object-cover"
                                        />
                                    )}
                                    <p className="line-clamp-2 text-sm text-muted-foreground">
                                        {lookup.title}
                                    </p>
                                </div>
                            )}
                            {lookup.status === 'not_found' && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    {t('admin.mods.lookup_not_found')}
                                </p>
                            )}
                            {lookup.status === 'error' && (
                                <p className="text-xs text-destructive">
                                    {t('admin.mods.lookup_error')}
                                </p>
                            )}
                            {lookup.status === 'no_mod_ids' && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    {t('admin.mods.lookup_no_mod_ids')}
                                </p>
                            )}
                        </div>

                        {lookup.status === 'bundle' && (
                            <div
                                className="space-y-2"
                                data-testid="bundle-preview"
                            >
                                <Alert className="border-sky-500/40 bg-sky-500/10">
                                    <Boxes className="size-4" />
                                    <AlertDescription className="text-xs">
                                        {t('admin.mods.lookup_is_bundle', {
                                            count: String(
                                                lookup.members.length,
                                            ),
                                        })}
                                    </AlertDescription>
                                </Alert>
                                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border p-2">
                                    {lookup.members.map((memberId) => (
                                        <li
                                            key={memberId}
                                            className="flex items-center gap-2 text-xs"
                                        >
                                            <ModThumb
                                                src={
                                                    details[memberId]
                                                        ?.preview_url
                                                }
                                                className="size-6"
                                            />
                                            <span className="truncate">
                                                {details[memberId]?.title ||
                                                    memberId}
                                            </span>
                                            {existingWorkshopIds.has(
                                                memberId,
                                            ) && (
                                                <Badge
                                                    variant="outline"
                                                    className="text-[10px] text-muted-foreground"
                                                >
                                                    {t(
                                                        'admin.mods.already_installed',
                                                    )}
                                                </Badge>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div
                            className={
                                lookup.status === 'bundle'
                                    ? 'hidden'
                                    : 'space-y-2'
                            }
                        >
                            <div className="flex items-center justify-between">
                                <Label htmlFor="mod-id">
                                    {t('admin.mods.table_mod_id')}
                                </Label>
                                {lookup.status === 'success' &&
                                    !manualOverride && (
                                        <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-auto px-2 py-0.5 text-xs"
                                            onClick={() =>
                                                setManualOverride(true)
                                            }
                                            data-testid="mod-id-edit-manually"
                                        >
                                            <Pencil className="mr-1 size-3" />
                                            {t('admin.mods.edit_manually')}
                                        </Button>
                                    )}
                            </div>
                            {lookup.status === 'success' &&
                            lookup.modIds.length > 1 &&
                            !manualOverride ? (
                                <Select value={modId} onValueChange={setModId}>
                                    <SelectTrigger
                                        id="mod-id"
                                        data-testid="mod-id-select"
                                    >
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {lookup.modIds.map((id) => (
                                            <SelectItem key={id} value={id}>
                                                {existingModIds.has(id)
                                                    ? t(
                                                          'admin.mods.mod_id_installed_option',
                                                          { mod_id: id },
                                                      )
                                                    : id}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="mod-id"
                                    value={modId}
                                    onChange={(e) => setModId(e.target.value)}
                                    placeholder={t(
                                        'admin.mods.mod_id_placeholder',
                                    )}
                                    disabled={
                                        lookup.status === 'loading' ||
                                        (lookup.status === 'success' &&
                                            !manualOverride)
                                    }
                                    data-testid="mod-id-input"
                                />
                            )}
                            {lookup.status === 'success' && !manualOverride && (
                                <p className="text-xs text-muted-foreground">
                                    {t('admin.mods.mod_id_auto_filled')}
                                </p>
                            )}
                            {isDuplicateMod && (
                                <p
                                    className="text-xs text-destructive"
                                    data-testid="duplicate-mod-warning"
                                >
                                    {t('admin.mods.duplicate_mod', {
                                        mod_id: modId,
                                    })}
                                </p>
                            )}
                        </div>

                        <div
                            className={
                                lookup.status === 'bundle'
                                    ? 'hidden'
                                    : 'space-y-2'
                            }
                        >
                            <Label>{t('admin.mods.extra_workshop_ids')}</Label>
                            <p className="text-xs text-muted-foreground">
                                {t('admin.mods.extra_workshop_ids_hint')}
                            </p>
                            <WorkshopIdEditor
                                ids={addWorkshopIds}
                                onChange={setAddWorkshopIds}
                                details={details}
                            />
                        </div>

                        <div
                            className={
                                lookup.status === 'bundle'
                                    ? 'hidden'
                                    : 'space-y-2'
                            }
                        >
                            <Label htmlFor="map-folder">
                                {t('admin.mods.map_folder_label')}
                            </Label>
                            {lookup.status === 'success' &&
                            lookup.mapFolders.length > 1 ? (
                                <Select
                                    value={mapFolder || '__none__'}
                                    onValueChange={(v) =>
                                        setMapFolder(v === '__none__' ? '' : v)
                                    }
                                >
                                    <SelectTrigger id="map-folder">
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">
                                            {t('admin.mods.map_folder_none')}
                                        </SelectItem>
                                        {lookup.mapFolders.map((f) => (
                                            <SelectItem key={f} value={f}>
                                                {f}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="map-folder"
                                    value={mapFolder}
                                    onChange={(e) =>
                                        setMapFolder(e.target.value)
                                    }
                                    placeholder={t(
                                        'admin.mods.map_folder_placeholder',
                                    )}
                                />
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAddDialog}>
                            {t('common.cancel')}
                        </Button>
                        {lookup.status === 'bundle' ? (
                            <Button
                                disabled={loading}
                                onClick={() => installBundle(workshopId.trim())}
                                data-testid="install-bundle-button"
                            >
                                <Boxes className="mr-1.5 size-4" />
                                {t('admin.mods.install_bundle', {
                                    count: String(lookup.members.length),
                                })}
                            </Button>
                        ) : (
                            <Button
                                disabled={
                                    loading ||
                                    !workshopId ||
                                    !modId ||
                                    isDuplicateMod ||
                                    lookup.status === 'loading'
                                }
                                onClick={addMod}
                            >
                                {t('admin.mods.add_mod')}
                            </Button>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Import Dialog */}
            <Dialog
                open={showBulk}
                onOpenChange={(open) =>
                    open ? setShowBulk(true) : closeBulk()
                }
            >
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.bulk_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.bulk_dialog_description')}
                        </DialogDescription>
                    </DialogHeader>

                    {bulkPhase === 'input' && (
                        <div className="space-y-3">
                            <Textarea
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                                rows={8}
                                placeholder={t('admin.mods.bulk_placeholder')}
                                className="font-mono text-xs"
                                data-testid="bulk-import-textarea"
                            />
                            <p className="text-xs text-muted-foreground">
                                {t('admin.mods.bulk_hint')}
                            </p>
                        </div>
                    )}

                    {bulkPhase === 'resolving' && (
                        <div className="space-y-3 py-2">
                            <div className="flex items-center gap-2 text-sm">
                                <Loader2 className="size-4 animate-spin" />
                                {t('admin.mods.bulk_resolving', {
                                    done: String(bulkProgress.done),
                                    total: String(bulkProgress.total),
                                })}
                            </div>
                            <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div
                                    className="h-full bg-primary transition-all"
                                    style={{
                                        width: `${bulkProgress.total ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%`,
                                    }}
                                />
                            </div>
                        </div>
                    )}

                    {bulkPhase === 'ready' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div
                                    className="rounded-md border p-2"
                                    data-testid="bulk-new-mods"
                                >
                                    <div className="text-lg font-semibold text-emerald-600">
                                        {bulkNewMods}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('admin.mods.bulk_new_mods')}
                                    </div>
                                </div>
                                <div className="rounded-md border p-2">
                                    <div className="text-lg font-semibold">
                                        {bulkNewWorkshop}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('admin.mods.bulk_new_workshop')}
                                    </div>
                                </div>
                                <div className="rounded-md border p-2">
                                    <div className="text-lg font-semibold text-amber-600">
                                        {bulkUnresolved.length}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {t('admin.mods.bulk_unresolved')}
                                    </div>
                                </div>
                            </div>
                            {bulkMapFolders.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {t('admin.mods.bulk_maps', {
                                        count: String(bulkMapFolders.length),
                                    })}
                                </p>
                            )}
                            {bulkBundleIds.length > 0 && (
                                <p
                                    className="text-xs text-muted-foreground"
                                    data-testid="bulk-bundles"
                                >
                                    {t('admin.mods.bulk_bundles', {
                                        count: String(bulkBundleIds.length),
                                    })}
                                </p>
                            )}
                            {bulkUnresolved.length > 0 && (
                                <Alert className="border-amber-500/40 bg-amber-500/10">
                                    <AlertTriangle className="size-4" />
                                    <AlertDescription className="text-xs">
                                        {t('admin.mods.bulk_unresolved_hint')}
                                        <span className="mt-1 block font-mono break-all">
                                            {bulkUnresolved.join('; ')}
                                        </span>
                                    </AlertDescription>
                                </Alert>
                            )}
                            {!bulkHasSomething && (
                                <p className="text-sm text-muted-foreground">
                                    {t('admin.mods.bulk_nothing')}
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {bulkPhase === 'input' && (
                            <>
                                <Button variant="outline" onClick={closeBulk}>
                                    {t('common.cancel')}
                                </Button>
                                <Button
                                    disabled={bulkText.trim() === ''}
                                    onClick={prepareBulk}
                                    data-testid="bulk-prepare-button"
                                >
                                    {t('admin.mods.bulk_prepare')}
                                </Button>
                            </>
                        )}
                        {bulkPhase === 'resolving' && (
                            <Button variant="outline" onClick={closeBulk}>
                                {t('common.cancel')}
                            </Button>
                        )}
                        {bulkPhase === 'ready' && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setBulkPhase('input')}
                                >
                                    {t('admin.mods.bulk_back')}
                                </Button>
                                <Button
                                    disabled={importing || !bulkHasSomething}
                                    onClick={submitBulk}
                                    data-testid="bulk-import-submit"
                                >
                                    {importing
                                        ? t('admin.mods.bulk_importing')
                                        : t('admin.mods.bulk_do_import', {
                                              count: String(
                                                  bulkModIds.length ||
                                                      bulkWorkshopIds.length,
                                              ),
                                          })}
                                </Button>
                            </>
                        )}
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog
                open={deleteTarget !== null}
                onOpenChange={() => setDeleteTarget(null)}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.delete_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.delete_dialog_description', {
                                mod_id: deleteTarget?.mod_id ?? '',
                                workshop_id: deleteTarget?.workshop_id ?? '',
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteCascade.length > 0 && (
                        <Alert
                            className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600"
                            data-testid="delete-cascade-alert"
                        >
                            <AlertTriangle className="size-4" />
                            <AlertDescription>
                                {t('admin.mods.delete_cascade_description', {
                                    mods: deleteCascade.join(', '),
                                })}
                            </AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            variant="outline"
                            disabled={loading}
                            onClick={() =>
                                deleteTarget && removeMod(deleteTarget, true)
                            }
                            data-testid="move-to-wishlist-button"
                        >
                            <Bookmark className="mr-1.5 size-4" />
                            {t('admin.mods.move_to_wishlist')}
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={loading}
                            onClick={() =>
                                deleteTarget && removeMod(deleteTarget)
                            }
                        >
                            {t('admin.mods.delete_dialog_title')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Workshop IDs Dialog */}
            <Dialog
                open={editTarget !== null}
                onOpenChange={(open) => !open && setEditTarget(null)}
            >
                <DialogContent data-testid="edit-workshop-ids-dialog">
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.edit_workshop_ids')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.edit_workshop_ids_description', {
                                mod_id: editTarget?.mod_id ?? '',
                            })}
                        </DialogDescription>
                    </DialogHeader>
                    <WorkshopIdEditor
                        ids={editWorkshopIds}
                        onChange={setEditWorkshopIds}
                        details={details}
                    />
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setEditTarget(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            disabled={loading}
                            onClick={saveWorkshopIds}
                            data-testid="save-workshop-ids"
                        >
                            {t('common.save')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bundle Removal Confirmation Dialog */}
            <Dialog
                open={bundleDeleteTarget !== null}
                onOpenChange={() => setBundleDeleteTarget(null)}
            >
                <DialogContent data-testid="bundle-delete-dialog">
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.bundle_delete_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t(
                                bundleDeleteTarget?.target === 'wishlist'
                                    ? 'admin.mods.bundle_delete_wishlist_description'
                                    : 'admin.mods.bundle_delete_description',
                                {
                                    title: bundleDeleteTarget
                                        ? bundleTitle(
                                              bundleDeleteTarget.bundleId,
                                          )
                                        : '',
                                    count: String(
                                        (
                                            bundles[
                                                bundleDeleteTarget?.bundleId ??
                                                    ''
                                            ] ?? []
                                        ).length,
                                    ),
                                },
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setBundleDeleteTarget(null)}
                        >
                            {t('common.cancel')}
                        </Button>
                        {bundleDeleteTarget?.target === 'installed' && (
                            <Button
                                variant="outline"
                                disabled={loading}
                                onClick={() =>
                                    removeBundle(
                                        bundleDeleteTarget.bundleId,
                                        'installed',
                                        true,
                                    )
                                }
                                data-testid="bundle-move-to-wishlist-button"
                            >
                                <Bookmark className="mr-1.5 size-4" />
                                {t('admin.mods.move_to_wishlist')}
                            </Button>
                        )}
                        <Button
                            variant="destructive"
                            disabled={loading}
                            onClick={() =>
                                bundleDeleteTarget &&
                                removeBundle(
                                    bundleDeleteTarget.bundleId,
                                    bundleDeleteTarget.target,
                                )
                            }
                            data-testid="bundle-delete-confirm"
                        >
                            {t('admin.mods.bundle_delete_dialog_title')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Wishlist Mod Dialog */}
            <Dialog
                open={showWish}
                onOpenChange={(open) => {
                    setShowWish(open);
                    if (!open) {
                        setWishId('');
                    }
                }}
            >
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.wishlist_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.wishlist_dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="wishlist-workshop-id">
                            {t('admin.mods.table_workshop_id')}
                        </Label>
                        <Input
                            id="wishlist-workshop-id"
                            inputMode="numeric"
                            value={wishId}
                            onChange={(e) => setWishId(e.target.value)}
                            placeholder={t(
                                'admin.mods.workshop_id_placeholder',
                            )}
                            data-testid="wishlist-workshop-id-input"
                        />
                        {wishDuplicate && (
                            <p
                                className="text-xs text-destructive"
                                data-testid="duplicate-wishlist-warning"
                            >
                                {t(
                                    wishDuplicate === 'installed'
                                        ? 'admin.mods.duplicate_wishlist_installed'
                                        : 'admin.mods.duplicate_wishlist',
                                )}
                            </p>
                        )}
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowWish(false);
                                setWishId('');
                            }}
                        >
                            {t('common.cancel')}
                        </Button>
                        <Button
                            disabled={
                                wishLoading ||
                                wishDuplicate !== null ||
                                !/^\d{1,20}$/.test(wishId.trim())
                            }
                            onClick={addWish}
                            data-testid="wishlist-submit-button"
                        >
                            {t('admin.mods.wishlist_mod')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Add to Wishlist Dialog */}
            <Dialog
                open={showWishlistBulk}
                onOpenChange={(open) =>
                    open ? setShowWishlistBulk(true) : closeWishlistBulk()
                }
            >
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>
                            {t('admin.mods.wishlist_bulk_dialog_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('admin.mods.wishlist_bulk_dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Textarea
                            value={wishlistBulkText}
                            onChange={(e) =>
                                setWishlistBulkText(e.target.value)
                            }
                            rows={8}
                            placeholder={t(
                                'admin.mods.wishlist_bulk_placeholder',
                            )}
                            className="font-mono text-xs"
                            data-testid="wishlist-bulk-import-textarea"
                        />
                        <p className="text-xs text-muted-foreground">
                            {wishlistBulkIds.length > 0
                                ? t('admin.mods.wishlist_bulk_count', {
                                      count: String(wishlistBulkIds.length),
                                  })
                                : t('admin.mods.wishlist_bulk_hint')}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeWishlistBulk}>
                            {t('common.cancel')}
                        </Button>
                        <Button
                            disabled={
                                wishlistBulkImporting ||
                                wishlistBulkIds.length === 0
                            }
                            onClick={submitWishlistBulk}
                            data-testid="wishlist-bulk-import-submit"
                        >
                            {wishlistBulkImporting
                                ? t('admin.mods.bulk_importing')
                                : t('admin.mods.wishlist_bulk_do_import', {
                                      count: String(wishlistBulkIds.length),
                                  })}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
