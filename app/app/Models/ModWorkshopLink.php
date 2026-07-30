<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A Workshop item a mod needs downloaded, beyond whatever the downloaded
 * content itself declares.
 *
 * PZ keeps `Mods=` and `WorkshopItems=` as two independent lists, so nothing in
 * server.ini says which item a given mod came from. `ModManager` recovers that
 * by scanning `mods/<Name>/mod.info` in the downloaded content — but that only
 * works once the item is on disk, and it can only ever name one item per mod.
 * Mods split across several uploads (a base plus a texture or map pack that
 * declares no mod ID of its own) need the association stated up front, which is
 * what these rows are: user intent, merged on top of the disk scan.
 *
 * @property int $id
 * @property string $mod_id
 * @property string $workshop_id
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class ModWorkshopLink extends Model
{
    protected $fillable = [
        'mod_id',
        'workshop_id',
    ];

    /**
     * Every linked Workshop ID keyed by mod ID, in insertion order.
     *
     * @return array<string, list<string>>
     */
    public static function map(): array
    {
        $links = [];

        foreach (self::query()->orderBy('id')->get(['mod_id', 'workshop_id']) as $link) {
            $links[$link->mod_id][] = $link->workshop_id;
        }

        return $links;
    }
}
