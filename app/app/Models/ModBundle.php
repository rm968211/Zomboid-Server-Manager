<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A Steam Workshop collection whose member mods the admin manages as one unit.
 *
 * Only the collection's own Workshop ID is stored — membership is resolved live
 * (and cached) from Steam via SteamWorkshopClient::getCollectionChildren(), the
 * same way WishlistMod avoids persisting Workshop metadata. That keeps the
 * grouping correct when a collection's author adds or drops a mod, and makes
 * "unbundle" a single row delete.
 *
 * @property int $id
 * @property string $workshop_id
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class ModBundle extends Model
{
    use HasFactory;

    protected $fillable = [
        'workshop_id',
    ];
}
