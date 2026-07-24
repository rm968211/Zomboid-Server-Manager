import { Crosshair, Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { useTranslation } from '@/hooks/use-translation';
import type { PlayerMarker } from '@/types/server';

export type TeleportDestination = {
    x: string;
    y: string;
    z: string;
};

type Props = {
    open: boolean;
    players: PlayerMarker[];
    target: string;
    destination: TeleportDestination;
    loading: boolean;
    onOpenChange: (open: boolean) => void;
    onTargetChange: (target: string) => void;
    onDestinationChange: (destination: TeleportDestination) => void;
    onPickLocation: () => void;
    onConfirm: () => void;
};

export default function PlayerTeleportDialog({
    open,
    players,
    target,
    destination,
    loading,
    onOpenChange,
    onTargetChange,
    onDestinationChange,
    onPickLocation,
    onConfirm,
}: Props) {
    const { t } = useTranslation();
    const selectedPlayer = players.find((player) => player.username === target);
    const hasDestination =
        destination.x.trim() !== '' &&
        destination.y.trim() !== '' &&
        destination.z.trim() !== '' &&
        [destination.x, destination.y, destination.z].every((value) =>
            Number.isFinite(Number(value)),
        );

    function updateCoordinate(
        coordinate: keyof TeleportDestination,
        value: string,
    ) {
        onDestinationChange({
            ...destination,
            [coordinate]: value,
        });
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {t('admin.player_map.teleport_title')}
                    </DialogTitle>
                    <DialogDescription>
                        {t('admin.player_map.teleport_description')}
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="teleport-player">
                            {t('admin.player_map.teleport_player_label')}
                        </Label>
                        <Select value={target} onValueChange={onTargetChange}>
                            <SelectTrigger id="teleport-player">
                                <SelectValue
                                    placeholder={t(
                                        'admin.player_map.teleport_player_placeholder',
                                    )}
                                />
                            </SelectTrigger>
                            <SelectContent>
                                {players.map((player) => (
                                    <SelectItem
                                        key={player.username}
                                        value={player.username}
                                    >
                                        {player.name !== player.username
                                            ? `${player.name} (${player.username})`
                                            : player.username}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full"
                        disabled={!selectedPlayer || loading}
                        onClick={onPickLocation}
                    >
                        <Crosshair className="mr-2 size-4" />
                        {t('admin.player_map.teleport_pick_location')}
                    </Button>

                    <div className="grid grid-cols-3 gap-3">
                        {(['x', 'y', 'z'] as const).map((coordinate) => (
                            <div key={coordinate} className="space-y-2">
                                <Label
                                    htmlFor={`teleport-${coordinate}`}
                                    className="uppercase"
                                >
                                    {coordinate}
                                </Label>
                                <Input
                                    id={`teleport-${coordinate}`}
                                    type="number"
                                    step="any"
                                    value={destination[coordinate]}
                                    onChange={(event) =>
                                        updateCoordinate(
                                            coordinate,
                                            event.target.value,
                                        )
                                    }
                                />
                            </div>
                        ))}
                    </div>

                    {selectedPlayer && (
                        <p className="text-xs text-muted-foreground">
                            {t('admin.player_map.teleport_current_position', {
                                x: selectedPlayer.x.toFixed(0),
                                y: selectedPlayer.y.toFixed(0),
                                z: String(selectedPlayer.z),
                            })}
                        </p>
                    )}
                </div>

                <DialogFooter>
                    <Button
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={loading}
                    >
                        {t('common.cancel')}
                    </Button>
                    <Button
                        onClick={onConfirm}
                        disabled={!selectedPlayer || !hasDestination || loading}
                    >
                        {loading ? (
                            <Loader2 className="mr-2 size-4 animate-spin" />
                        ) : (
                            <MapPin className="mr-2 size-4" />
                        )}
                        {t('admin.player_map.teleport_confirm')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
