import { Head } from '@inertiajs/react';
import { Activity, Pause, Play, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
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
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import AppLayout from '@/layouts/app-layout';
import { formatDateTime, formatTime } from '@/lib/dates';
import type { BreadcrumbItem } from '@/types';

/** Shape produced by App\Services\LogFormatter. */
type LogEntry = {
    time: string | null;
    level: 'error' | 'warn' | 'log' | 'info';
    source: string | null;
    message: string;
    details: string[];
};

const LEVEL_STYLES: Record<
    LogEntry['level'],
    { label: string; text: string; border: string }
> = {
    error: {
        label: 'ERROR',
        text: 'text-red-400',
        border: 'border-red-500/60',
    },
    warn: {
        label: 'WARN',
        text: 'text-amber-400',
        border: 'border-amber-500/50',
    },
    log: { label: 'LOG', text: 'text-zinc-500', border: 'border-transparent' },
    info: { label: '', text: 'text-zinc-500', border: 'border-transparent' },
};

export default function Logs({ lines: initialLines }: { lines: LogEntry[] }) {
    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Dashboard', href: '/dashboard' },
        { title: 'Server Logs', href: '/admin/logs' },
    ];
    const [lines, setLines] = useState(initialLines);
    const [autoRefresh, setAutoRefresh] = useState(true);
    const [tail, setTail] = useState('100');
    const [refreshing, setRefreshing] = useState(false);
    const outputRef = useRef<HTMLDivElement>(null);

    const fetchLogs = useCallback(() => {
        setRefreshing(true);
        fetch(`/admin/logs/fetch?tail=${tail}`)
            .then((r) => r.json())
            .then((data) => {
                if (data.lines) {
                    setLines(data.lines);
                }
            })
            .catch(() => {})
            .finally(() => setRefreshing(false));
    }, [tail]);

    useEffect(() => {
        if (!autoRefresh) return;

        const interval = setInterval(fetchLogs, 5000);
        return () => clearInterval(interval);
    }, [autoRefresh, fetchLogs]);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Server Logs" />
            <div className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight">
                            Server Logs
                        </h1>
                        <p className="text-muted-foreground">
                            Live game server container output
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <Select
                            value={tail}
                            onValueChange={(v) => {
                                setTail(v);
                            }}
                        >
                            <SelectTrigger className="w-[120px]">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="50">
                                    {`${'50'} lines`}
                                </SelectItem>
                                <SelectItem value="100">
                                    {`${'100'} lines`}
                                </SelectItem>
                                <SelectItem value="200">
                                    {`${'200'} lines`}
                                </SelectItem>
                                <SelectItem value="500">
                                    {`${'500'} lines`}
                                </SelectItem>
                            </SelectContent>
                        </Select>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setAutoRefresh(!autoRefresh)}
                        >
                            {autoRefresh ? (
                                <>
                                    <Pause className="mr-1.5 size-3.5" />{' '}
                                    {'Pause'}
                                </>
                            ) : (
                                <>
                                    <Play className="mr-1.5 size-3.5" />{' '}
                                    {'Resume'}
                                </>
                            )}
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchLogs}
                            disabled={refreshing}
                        >
                            <RefreshCw
                                className={`mr-1.5 size-3.5 ${refreshing ? 'animate-spin' : ''}`}
                            />
                            Refresh
                        </Button>
                    </div>
                </div>

                <Card className="flex flex-1 flex-col">
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle className="flex items-center gap-2">
                                <Activity className="size-5" />
                                Container Output
                            </CardTitle>
                            <CardDescription>
                                {`${String(lines.length)} entries`}
                            </CardDescription>
                        </div>
                        {autoRefresh && (
                            <Badge variant="outline" className="text-xs">
                                <span className="mr-1.5 inline-block size-1.5 animate-pulse rounded-full bg-green-500" />
                                Auto-refresh
                            </Badge>
                        )}
                    </CardHeader>
                    <CardContent className="flex-1">
                        <div
                            ref={outputRef}
                            className="max-h-[70vh] min-h-[500px] overflow-auto rounded-lg bg-zinc-950 p-4 font-mono text-xs leading-relaxed"
                        >
                            {lines.length > 0 ? (
                                lines.map((entry, i) => {
                                    const style =
                                        LEVEL_STYLES[entry.level] ??
                                        LEVEL_STYLES.info;

                                    return (
                                        <div
                                            key={i}
                                            className={`border-l-2 py-0.5 pl-2 hover:bg-zinc-900/50 ${style.border}`}
                                        >
                                            <div className="flex gap-3">
                                                <span
                                                    className="w-[62px] shrink-0 text-zinc-600 tabular-nums select-none"
                                                    title={
                                                        entry.time
                                                            ? formatDateTime(
                                                                  entry.time,
                                                              )
                                                            : undefined
                                                    }
                                                >
                                                    {entry.time
                                                        ? formatTime(
                                                              new Date(
                                                                  entry.time,
                                                              ),
                                                          )
                                                        : ''}
                                                </span>
                                                <span
                                                    className={`w-11 shrink-0 font-semibold ${style.text}`}
                                                >
                                                    {style.label}
                                                </span>
                                                <span className="w-20 shrink-0 truncate text-cyan-400/70">
                                                    {entry.source ?? ''}
                                                </span>
                                                <span className="min-w-0 flex-1 break-words whitespace-pre-wrap text-zinc-300">
                                                    {entry.message}
                                                </span>
                                            </div>
                                            {entry.details.length > 0 && (
                                                <details className="ml-[122px]">
                                                    <summary className="cursor-pointer text-zinc-600 select-none hover:text-zinc-400">
                                                        {`${String(entry.details.length)} more lines`}
                                                    </summary>
                                                    <pre className="overflow-x-auto py-1 text-zinc-500">
                                                        {entry.details.join(
                                                            '\n',
                                                        )}
                                                    </pre>
                                                </details>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <p className="text-zinc-500">
                                    No log output available
                                </p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
