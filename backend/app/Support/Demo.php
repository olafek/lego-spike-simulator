<?php

namespace App\Support;

/**
 * The public demo: /demo and /demo/api/*, open to anyone when LAB_DEMO_ENABLED=true.
 *
 * A demo request never touches the real lab: it only sees projects it created itself
 * (matched by a random owner id kept in its own session), the AI provider is forced to the
 * offline mock, and its limits are much tighter. State lives on the current request only.
 */
class Demo
{
    private const ATTRIBUTE = 'lab_demo_owner';

    public static function enabled(): bool
    {
        return (bool) config('lab.demo.enabled');
    }

    public static function activate(string $owner): void
    {
        request()->attributes->set(self::ATTRIBUTE, $owner);
    }

    public static function active(): bool
    {
        return self::owner() !== null;
    }

    public static function owner(): ?string
    {
        $owner = app()->bound('request') ? request()->attributes->get(self::ATTRIBUTE) : null;

        return is_string($owner) && $owner !== '' ? $owner : null;
    }

    /** URL prefix for links the API hands back (screenshot images). */
    public static function prefix(): string
    {
        return self::active() ? '/demo' : '';
    }
}
