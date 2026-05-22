import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Globe, Search } from 'lucide-react';
import { shopApi } from '../../../services/shopApi';
import { useShopTimezone } from '../../../context/ShopTimezoneContext';
import {
  formatTimezoneLabel,
  getIanaTimezones,
  groupIanaTimezones,
} from '../../../constants/ianaTimezones';
import { DEFAULT_SHOP_TIMEZONE, normalizeShopTimezone } from '../../../utils/shopTimezone';
import Card from '../../ui/Card';
import Button from '../../ui/Button';
import Input from '../../ui/Input';

export const RegionalSettingsSection: React.FC = () => {
  const { timezone: activeTz, refresh: refreshContext } = useShopTimezone();
  const [timezone, setTimezone] = useState(activeTz || DEFAULT_SHOP_TIMEZONE);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const allZones = useMemo(() => getIanaTimezones(), []);
  const groups = useMemo(() => groupIanaTimezones(allZones), [allZones]);

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return groups;
    return groups
      .map((g) => ({
        ...g,
        zones: g.zones.filter(
          (z) =>
            z.toLowerCase().includes(q) ||
            formatTimezoneLabel(z).toLowerCase().includes(q)
        ),
      }))
      .filter((g) => g.zones.length > 0);
  }, [groups, filter]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await shopApi.getRegionalSettings();
      const tz = normalizeShopTimezone(data.timezone);
      setTimezone(tz);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load regional settings');
      setTimezone(activeTz || DEFAULT_SHOP_TIMEZONE);
    } finally {
      setLoading(false);
    }
  }, [activeTz]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!loading) setTimezone(activeTz);
  }, [activeTz, loading]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const data = await shopApi.updateRegionalSettings({ timezone });
      setTimezone(normalizeShopTimezone(data.timezone));
      await refreshContext();
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to save timezone');
    } finally {
      setSaving(false);
    }
  };

  const previewNow = formatTimezoneLabel(timezone);

  return (
    <Card className="border-none shadow-sm p-6 max-w-3xl">
      <div className="flex items-center gap-2 mb-2">
        <Globe className="w-5 h-5 text-primary-600" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Regional &amp; timezone
        </h3>
      </div>
      <p className="text-sm text-muted-foreground mb-6">
        Choose the timezone for this shop. Daily reports, sales day boundaries, and calendar dates
        use this zone when saving and querying data.
      </p>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground mb-1">
              Shop timezone
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Current shop time: <span className="font-medium text-foreground">{previewNow}</span>
            </p>
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search timezones (e.g. Karachi, Dubai, New York)…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-9"
              />
            </div>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              size={12}
              className="w-full rounded-lg border border-border bg-background text-foreground text-sm font-mono focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              aria-label="Shop timezone"
            >
              {filteredGroups.length === 0 ? (
                <option value={timezone}>{formatTimezoneLabel(timezone)}</option>
              ) : (
                filteredGroups.map((g) => (
                  <optgroup key={g.region} label={g.region}>
                    {g.zones.map((z) => (
                      <option key={z} value={z}>
                        {formatTimezoneLabel(z)}
                      </option>
                    ))}
                  </optgroup>
                ))
              )}
            </select>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && (
            <p className="text-sm text-emerald-600 font-medium">Timezone saved.</p>
          )}

          <Button onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'Save timezone'}
          </Button>
        </div>
      )}
    </Card>
  );
};
