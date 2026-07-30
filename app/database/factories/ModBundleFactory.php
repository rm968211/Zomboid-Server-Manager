<?php

namespace Database\Factories;

use App\Models\ModBundle;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<ModBundle>
 */
class ModBundleFactory extends Factory
{
    protected $model = ModBundle::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'workshop_id' => (string) fake()->unique()->numberBetween(1000000000, 3999999999),
        ];
    }
}
