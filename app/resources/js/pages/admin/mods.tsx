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
import AppLayout from '@/layouts/app-layout';
import { fetchAction } from '@/lib/fetch-action';
import { parseModImport } from '@/lib/parse-mod-import';
import type {
    BreadcrumbItem,
    BuildCompat,
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
    | { status: 'error' };

function StatusBadge({ status }: { status: ModEntry['status'] }) {
    if (status === 'active') {
        return (
            <Badge
                variant="outline"
                className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                data-testid="mod-status-active"
            >
                <CheckCircle2 className="size-3" />
                Active
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
                Pending restart
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="gap-1 text-muted-foreground"
            data-testid="mod-status-stopped"
        >
            Stopped
        </Badge>
    );
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
                B42
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
                B41 only
            </Badge>
        );
    }

    return (
        <Badge
            variant="outline"
            className="text-xs text-muted-foreground"
            data-testid="compat-unknown"
        >
            B42 unknown
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
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
            {details.subscriptions != null && (
                <span className="flex items-center gap-1">
                    <Star className="size-3" />
                    {details.subscriptions.toLocaleString()}
                </span>
            )}
            {details.time_updated != null && (
                <span>{`Updated ${fmtDate(details.time_updated)}`}</span>
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
}: {
    mod: ModEntry;
    index: number;
    onDelete: (mod: ModEntry) => void;
    isDragDisabled: boolean;
    isProtected: boolean;
    group: GroupInfo;
    installedModIds: Set<string>;
    details?: WorkshopDetails | null;
}) {
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
                isGrouped ? 'border-l-2 border-l-primary/40' : '',
            ]
                .filter(Boolean)
                .join(' ')}
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
                                Required
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
                                        Required
                                    </Badge>
                                )}
                                <CompatBadge compat={details?.build_compat} />
                                {group.position === 'start' && (
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <Badge
                                                variant="outline"
                                                className="gap-1 text-xs"
                                                data-testid="bundle-badge"
                                            >
                                                <Layers className="size-3" />
                                                {`Bundle ×${String(
                                                    group.siblings.length,
                                                )}`}
                                            </Badge>
                                        </TooltipTrigger>
                                        <TooltipContent>
                                            {group.siblings.join(', ')}
                                        </TooltipContent>
                                    </Tooltip>
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
                        {`Requires: ${requires.join(', ')}`}
                    </div>
                )}
                {blocked && (
                    <div className="mt-1 truncate text-xs text-amber-600 dark:text-amber-400">
                        {`Required by: ${requiredBy.join(', ')}`}
                    </div>
                )}
            </TableCell>
            <TableCell className="hidden sm:table-cell">
                <Badge variant="secondary" className="text-xs">
                    {mod.workshop_id}
                </Badge>
            </TableCell>
            <TableCell>
                <StatusBadge status={mod.status} />
            </TableCell>
            <TableCell className="text-right">
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
}: {
    mods: ModEntry[];
    protectedWorkshopIds?: string[];
    pendingRestart?: boolean;
    serverStatus?: 'offline' | 'starting' | 'online';
    wishlist?: string[];
}) {
    const protectedSet = useMemo(
        () => new Set(protectedWorkshopIds),
        [protectedWorkshopIds],
    );

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Mod Manager', href: '/admin/mods' },
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
    const existingModIds = useMemo(
        () => new Set(mods.map((m) => m.mod_id).filter(Boolean)),
        [mods],
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
    const [importing, setImporting] = useState(false);
    const bulkCancelled = useRef(false);

    const isFiltering = search.length > 0;

    const bulkNewMods = bulkModIds.filter((m) => !existingModIds.has(m)).length;
    const bulkNewWorkshop = bulkWorkshopIds.filter(
        (w) => !existingWorkshopIds.has(w),
    ).length;
    const bulkHasSomething =
        bulkModIds.length > 0 || bulkWorkshopIds.length > 0;

    function openBulk() {
        bulkCancelled.current = false;
        setBulkText('');
        setBulkPhase('input');
        setBulkProgress({ done: 0, total: 0 });
        setBulkWorkshopIds([]);
        setBulkModIds([]);
        setBulkMapFolders([]);
        setBulkUnresolved([]);
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

        for (let i = 0; i < parsed.workshopIds.length; i++) {
            if (bulkCancelled.current) {
                return;
            }
            const id = parsed.workshopIds[i];
            const json = (await fetchAction('/admin/mods/lookup', {
                data: { workshop_id: id },
                silent: true,
            })) as {
                found?: boolean;
                mod_ids?: string[];
                map_folders?: string[];
            } | null;

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
        setBulkPhase('ready');
    }

    async function submitBulk() {
        setImporting(true);
        const result = await fetchAction('/admin/mods/import', {
            data: {
                workshop_ids: bulkWorkshopIds,
                mod_ids: bulkModIds,
                map: bulkMapFolders,
            },
            successMessage: `Imported ${String(bulkModIds.length || bulkWorkshopIds.length)} mod(s). Restart the server to load them.`,
        });
        setImporting(false);
        if (result) {
            closeBulk();
            router.reload({
                only: ['mods', 'pendingRestart', 'serverStatus'],
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
        mods.forEach((m) => {
            if (m.workshop_id) {
                wanted.add(m.workshop_id);
            }
        });
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
    }, [mods, wishlist, details]);

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
            return [...entries].sort(
                (a, b) =>
                    rank[a.details?.build_compat ?? 'unknown'] -
                    rank[b.details?.build_compat ?? 'unknown'],
            );
        }
        return entries;
    }, [wishlist, details, wishSort]);

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

        if (modIds.length === 0) {
            setLookup({ status: 'no_mod_ids', title, previewUrl, mapFolders });
            setModId('');
            setMapFolder(mapFolders[0] ?? '');
            setManualOverride(true);
            return;
        }

        setLookup({ status: 'success', title, previewUrl, modIds, mapFolders });
        setModId(modIds[0]);
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
            successMessage: 'Mod load order updated',
        });

        router.reload({ only: ['mods', 'pendingRestart', 'serverStatus'] });
    }

    async function restartServer() {
        setRestarting(true);
        const started = await fetchAction('/admin/server/restart', {
            method: 'POST',
            successMessage:
                'Server restart started — mods will load in a moment',
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
        resetLookupState();
    }

    async function addMod() {
        setLoading(true);
        const result = await fetchAction('/admin/mods', {
            data: {
                workshop_id: workshopId,
                mod_id: modId,
                map_folder: mapFolder || null,
            },
            successMessage: `Added mod ${modId}`,
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
                    ? `${mod.mod_id} moved to the wishlist`
                    : `Removed mod ${mod.mod_id}`,
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

    async function addWish() {
        setWishLoading(true);
        const result = await fetchAction('/admin/mods/wishlist', {
            data: { workshop_id: wishId.trim() },
            successMessage: 'Added to wishlist',
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
            successMessage: 'Removed from wishlist',
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
            successMessage: `Added ${String(wishlistBulkIds.length)} mod(s) to the wishlist`,
        })) as { added?: string[]; skipped?: number } | null;
        setWishlistBulkImporting(false);

        if (result) {
            closeWishlistBulk();
            router.reload({ only: ['wishlist'] });
        }
    }

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Mod Manager" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Mod Manager
                        </h1>
                        <p className="text-muted-foreground">
                            {`${String(mods.length)} mod(s) installed`}
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
                                    Bulk import
                                </Button>
                                <Button onClick={() => setShowAdd(true)}>
                                    <Plus className="mr-1.5 size-4" />
                                    Add Mod
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
                                    Bulk import
                                </Button>
                                <Button
                                    onClick={() => setShowWish(true)}
                                    data-testid="wishlist-mod-button"
                                >
                                    <BookmarkPlus className="mr-1.5 size-4" />
                                    Wishlist mod
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
                        {'Installed'} ({mods.length})
                    </ToggleGroupItem>
                    <ToggleGroupItem
                        value="wishlist"
                        data-testid="tab-wishlist"
                    >
                        <Bookmark className="mr-1.5 size-4" />
                        {'Wishlist'} ({wishlist.length})
                    </ToggleGroupItem>
                </ToggleGroup>

                {view === 'installed' && (
                    <Card>
                        <CardHeader>
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div>
                                    <CardTitle className="flex items-center gap-2">
                                        <Package className="size-5" />
                                        Installed Mods
                                    </CardTitle>
                                    <CardDescription>
                                        {`${String(
                                            filteredMods.length,
                                        )} of ${String(mods.length)} mods · Drag to reorder load order`}
                                    </CardDescription>
                                </div>
                                <div className="relative">
                                    <Search className="absolute top-2.5 left-2.5 size-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search mods..."
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
                                                ? 'Server is restarting — mod changes will take effect once it finishes loading.'
                                                : 'Mod changes are waiting for a server restart to take effect.'}
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
                                                ? 'Restarting...'
                                                : 'Restart server'}
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
                                                <TableHead>Mod ID</TableHead>
                                                <TableHead className="hidden sm:table-cell">
                                                    Workshop ID
                                                </TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">
                                                    Actions
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
                                                            onDelete={
                                                                setDeleteTarget
                                                            }
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
                                        ? 'No mods match your search'
                                        : 'No mods installed'}
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
                                        Wishlist
                                    </CardTitle>
                                    <CardDescription>
                                        {`${String(wishlist.length)} mod(s) you follow without installing`}
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
                                            Recently added
                                        </SelectItem>
                                        <SelectItem value="b42">
                                            Build 42 first
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
                                            <TableHead>{'Mod'}</TableHead>
                                            <TableHead className="hidden sm:table-cell">
                                                Workshop ID
                                            </TableHead>
                                            <TableHead>{'Build 42'}</TableHead>
                                            <TableHead className="text-right">
                                                Actions
                                            </TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedWishlist.map(
                                            ({ id, details: d }) => {
                                                const installed =
                                                    existingWorkshopIds.has(id);
                                                const isLoadingDetails =
                                                    d === undefined;
                                                return (
                                                    <TableRow
                                                        key={id}
                                                        data-testid="wishlist-row"
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
                                                                        {
                                                                            'Installed'
                                                                        }
                                                                    </Badge>
                                                                ) : (
                                                                    <Button
                                                                        variant="outline"
                                                                        size="sm"
                                                                        onClick={() =>
                                                                            installFromWishlist(
                                                                                id,
                                                                            )
                                                                        }
                                                                        data-testid="wishlist-install"
                                                                    >
                                                                        <Download className="mr-1.5 size-4" />
                                                                        {
                                                                            'Install'
                                                                        }
                                                                    </Button>
                                                                )}
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    className="text-destructive hover:text-destructive"
                                                                    onClick={() =>
                                                                        removeWish(
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
                                    {
                                        'No wishlisted mods yet. Use "Wishlist mod" to follow a Workshop mod without installing it.'
                                    }
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
                        <DialogTitle>{'Add Mod'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Add a Steam Workshop mod. Both Workshop ID and Mod ID are required.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="workshop-id">{'Workshop ID'}</Label>
                            <div className="relative">
                                <Input
                                    id="workshop-id"
                                    inputMode="numeric"
                                    value={workshopId}
                                    onChange={(e) =>
                                        setWorkshopId(e.target.value)
                                    }
                                    placeholder="e.g. 2313387159"
                                    data-testid="workshop-id-input"
                                />
                                {lookup.status === 'loading' && (
                                    <Loader2 className="absolute top-2.5 right-2.5 size-4 animate-spin text-muted-foreground" />
                                )}
                            </div>
                            {(lookup.status === 'success' ||
                                lookup.status === 'no_mod_ids') && (
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
                                    {
                                        'Workshop item not found. You can enter the Mod ID manually.'
                                    }
                                </p>
                            )}
                            {lookup.status === 'error' && (
                                <p className="text-xs text-destructive">
                                    {
                                        'Could not reach Steam. You can enter the Mod ID manually.'
                                    }
                                </p>
                            )}
                            {lookup.status === 'no_mod_ids' && (
                                <p className="text-xs text-amber-600 dark:text-amber-400">
                                    {
                                        'No "Mod ID:" line found in the Workshop description. Please enter the Mod ID manually.'
                                    }
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="mod-id">{'Mod ID'}</Label>
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
                                            Edit manually
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
                                                {id}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    id="mod-id"
                                    value={modId}
                                    onChange={(e) => setModId(e.target.value)}
                                    placeholder="e.g. Arsenal(26)GunFighter"
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
                                    {
                                        'Auto-filled from the Workshop description.'
                                    }
                                </p>
                            )}
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="map-folder">
                                Map Folder (optional)
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
                                            None
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
                                    placeholder="Only for map mods"
                                />
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeAddDialog}>
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                loading ||
                                !workshopId ||
                                !modId ||
                                lookup.status === 'loading'
                            }
                            onClick={addMod}
                        >
                            Add Mod
                        </Button>
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
                        <DialogTitle>{'Bulk import mods'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Paste your WorkshopItems= and Mods= lines (and optional Map=) from a working server.ini, or just a list of Workshop IDs. Imported mods are merged into your list and saved permanently.'
                            }
                        </DialogDescription>
                    </DialogHeader>

                    {bulkPhase === 'input' && (
                        <div className="space-y-3">
                            <Textarea
                                value={bulkText}
                                onChange={(e) => setBulkText(e.target.value)}
                                rows={8}
                                placeholder={
                                    'WorkshopItems=2900580391;2772575623\nMods=ModA;ModB\nMap=MyMap;Muldraugh, KY\n\n— or —\n\n2900580391;2772575623;3005903549'
                                }
                                className="font-mono text-xs"
                                data-testid="bulk-import-textarea"
                            />
                            <p className="text-xs text-muted-foreground">
                                {
                                    'Pasting only Workshop IDs works too, but each ID is looked up on Steam (slower). Pasting the Mods= line is instant and most reliable.'
                                }
                            </p>
                        </div>
                    )}

                    {bulkPhase === 'resolving' && (
                        <div className="space-y-3 py-2">
                            <div className="flex items-center gap-2 text-sm">
                                <Loader2 className="size-4 animate-spin" />
                                {`Looking up mods on Steam… ${String(bulkProgress.done)} / ${String(bulkProgress.total)}`}
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
                                        New mods
                                    </div>
                                </div>
                                <div className="rounded-md border p-2">
                                    <div className="text-lg font-semibold">
                                        {bulkNewWorkshop}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        New Workshop items
                                    </div>
                                </div>
                                <div className="rounded-md border p-2">
                                    <div className="text-lg font-semibold text-amber-600">
                                        {bulkUnresolved.length}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        Unresolved
                                    </div>
                                </div>
                            </div>
                            {bulkMapFolders.length > 0 && (
                                <p className="text-xs text-muted-foreground">
                                    {`${String(bulkMapFolders.length)} map folder(s) will be merged into Map=`}
                                </p>
                            )}
                            {bulkUnresolved.length > 0 && (
                                <Alert className="border-amber-500/40 bg-amber-500/10">
                                    <AlertTriangle className="size-4" />
                                    <AlertDescription className="text-xs">
                                        {
                                            'These Workshop IDs could not be resolved (no Mod ID found on Steam). Add them individually from the Add Mod dialog:'
                                        }
                                        <span className="mt-1 block font-mono break-all">
                                            {bulkUnresolved.join('; ')}
                                        </span>
                                    </AlertDescription>
                                </Alert>
                            )}
                            {!bulkHasSomething && (
                                <p className="text-sm text-muted-foreground">
                                    {
                                        'Nothing to import — no valid mods were found in the pasted text.'
                                    }
                                </p>
                            )}
                        </div>
                    )}

                    <DialogFooter>
                        {bulkPhase === 'input' && (
                            <>
                                <Button variant="outline" onClick={closeBulk}>
                                    Cancel
                                </Button>
                                <Button
                                    disabled={bulkText.trim() === ''}
                                    onClick={prepareBulk}
                                    data-testid="bulk-prepare-button"
                                >
                                    Prepare import
                                </Button>
                            </>
                        )}
                        {bulkPhase === 'resolving' && (
                            <Button variant="outline" onClick={closeBulk}>
                                Cancel
                            </Button>
                        )}
                        {bulkPhase === 'ready' && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={() => setBulkPhase('input')}
                                >
                                    Back
                                </Button>
                                <Button
                                    disabled={importing || !bulkHasSomething}
                                    onClick={submitBulk}
                                    data-testid="bulk-import-submit"
                                >
                                    {importing
                                        ? 'Importing…'
                                        : `Import ${String(
                                              bulkModIds.length ||
                                                  bulkWorkshopIds.length,
                                          )} mod(s)`}
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
                        <DialogTitle>{'Remove Mod'}</DialogTitle>
                        <DialogDescription>
                            {`Are you sure you want to remove ${deleteTarget?.mod_id ?? ''} (${deleteTarget?.workshop_id ?? ''})? A server restart will be required.`}
                        </DialogDescription>
                    </DialogHeader>
                    {deleteCascade.length > 0 && (
                        <Alert
                            className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200 [&>svg]:text-amber-600"
                            data-testid="delete-cascade-alert"
                        >
                            <AlertTriangle className="size-4" />
                            <AlertDescription>
                                {`Also removes ${deleteCascade.join(', ')}, since they require this mod.`}
                            </AlertDescription>
                        </Alert>
                    )}
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteTarget(null)}
                        >
                            Cancel
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
                            Move to wishlist
                        </Button>
                        <Button
                            variant="destructive"
                            disabled={loading}
                            onClick={() =>
                                deleteTarget && removeMod(deleteTarget)
                            }
                        >
                            Remove Mod
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
                        <DialogTitle>{'Add to Wishlist'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Track a Steam Workshop mod without installing it on the server.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="wishlist-workshop-id">
                            Workshop ID
                        </Label>
                        <Input
                            id="wishlist-workshop-id"
                            inputMode="numeric"
                            value={wishId}
                            onChange={(e) => setWishId(e.target.value)}
                            placeholder="e.g. 2313387159"
                            data-testid="wishlist-workshop-id-input"
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowWish(false);
                                setWishId('');
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            disabled={
                                wishLoading || !/^\d{1,20}$/.test(wishId.trim())
                            }
                            onClick={addWish}
                            data-testid="wishlist-submit-button"
                        >
                            Wishlist mod
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
                        <DialogTitle>{'Bulk add to wishlist'}</DialogTitle>
                        <DialogDescription>
                            {
                                'Paste a list of Workshop IDs (semicolons, commas, or newlines). IDs already installed or already on the wishlist are skipped.'
                            }
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <Textarea
                            value={wishlistBulkText}
                            onChange={(e) =>
                                setWishlistBulkText(e.target.value)
                            }
                            rows={8}
                            placeholder="2900580391;2772575623;3005903549"
                            className="font-mono text-xs"
                            data-testid="wishlist-bulk-import-textarea"
                        />
                        <p className="text-xs text-muted-foreground">
                            {wishlistBulkIds.length > 0
                                ? `${String(wishlistBulkIds.length)} Workshop ID(s) found`
                                : 'Paste Workshop IDs separated by semicolons, commas, or newlines.'}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={closeWishlistBulk}>
                            Cancel
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
                                ? 'Importing…'
                                : `Add ${String(wishlistBulkIds.length)} mod(s)`}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
