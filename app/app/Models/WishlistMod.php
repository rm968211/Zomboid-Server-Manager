<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

/**
 * A Steam Workshop mod the admin follows without installing it.
 * Workshop metadata is not persisted — it is fetched live (and cached)
 * via SteamWorkshopClient so the list never goes stale.
 *
 * @property int $id
 * @property string $workshop_id
 * @property \Illuminate\Support\Carbon $created_at
 * @property \Illuminate\Support\Carbon $updated_at
 */
class WishlistMod extends Model
{
    use HasFactory;

    protected $fillable = [
        'workshop_id',
    ];
}
