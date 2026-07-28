(function () {
  "use strict";

  const missingColumnPattern = /column .* does not exist|schema cache|could not find .* column|could not find .* in the schema/i;

  function isMissingColumnError(error) {
    return ["42703", "PGRST204"].includes(String(error?.code || ""))
      || missingColumnPattern.test(String(error?.message || ""));
  }

  function normalizeLimit(limit, pageSize = 20) {
    const numeric = Number(limit);
    return !Number.isNaN(numeric) && numeric > 0 ? numeric : pageSize;
  }

  function createTableClient(config = {}) {
    const {
      applyScopedFilters,
      cachePrefix,
      cacheTtl = 45_000,
      defaultOrderTables = [],
      getCacheScope = () => "",
      getClient = () => window.getSupabaseClient?.(),
      onFetchError,
      pageSize = 20,
      runSpecialQuery,
      state
    } = config;

    if (!state?.queryCache || !state?.inFlightRequests) {
      throw new Error("Portal data client requires state.queryCache and state.inFlightRequests.");
    }
    if (!cachePrefix) {
      throw new Error("Portal data client requires a cachePrefix.");
    }

    const defaultOrderSet = new Set(defaultOrderTables);

    async function fetchTableSafe(spec, options = {}) {
      try {
        const rows = await withTimeoutIfNeeded(fetchTable(spec, options), spec, options, "loading");
        return { ...spec, rows, error: null };
      } catch (error) {
        if (spec.fallbackSelect && isMissingColumnError(error)) {
          try {
            const rows = await withTimeoutIfNeeded(
              fetchTable({ ...spec, select: spec.fallbackSelect, fallbackSelect: null }, { ...options, force: true }),
              spec,
              options,
              "fallback loading"
            );
            return { ...spec, rows, error: null };
          } catch (fallbackError) {
            error = fallbackError;
          }
        }
        onFetchError?.(spec, error);
        return { ...spec, rows: [], error };
      }
    }

    async function fetchTable(spec, options = {}) {
      const limit = normalizeLimit(spec.limit, pageSize);
      const cacheKey = queryCacheKey(spec, limit);
      if (!options.force) {
        const memory = state.queryCache.get(cacheKey);
        if (memory && Date.now() - memory.timestamp < cacheTtl) return memory.rows;
        const stored = readCachedRows(cacheKey);
        if (stored) {
          revalidateTable(spec, limit, cacheKey);
          return stored.rows;
        }
        if (state.inFlightRequests.has(cacheKey)) return state.inFlightRequests.get(cacheKey);
      }

      const promise = runSupabaseQuery(getClient(), spec, limit)
        .then((rows) => {
          writeCachedRows(cacheKey, rows);
          return rows;
        })
        .finally(() => state.inFlightRequests.delete(cacheKey));
      state.inFlightRequests.set(cacheKey, promise);
      return promise;
    }

    async function runSupabaseQuery(supabaseClient, spec, limit) {
      const specialRows = await runSpecialQuery?.(supabaseClient, spec, limit);
      if (specialRows) return specialRows;

      let query = supabaseClient.from(spec.table).select(spec.select);
      if (applyScopedFilters) query = applyScopedFilters(query, spec);
      if (spec.order) {
        const [column, direction = "desc"] = spec.order.split(".");
        query = query.order(column, { ascending: direction === "asc" });
      } else if (defaultOrderSet.has(spec.table)) {
        query = query.order("created_at", { ascending: false });
      }
      const { data, error } = await query.range(0, limit - 1);
      if (error) throw error;
      return data || [];
    }

    function queryCacheKey(spec, limit) {
      return `${cachePrefix}${spec.table}:${spec.select}:${spec.scope || "all"}:${spec.order || ""}:${limit}:${getCacheScope(spec)}`;
    }

    function readCachedRows(cacheKey) {
      const memory = state.queryCache.get(cacheKey);
      if (memory) return memory;
      try {
        const cached = JSON.parse(sessionStorage.getItem(cacheKey) || "null");
        if (!cached || Date.now() - cached.timestamp > cacheTtl * 4) return null;
        state.queryCache.set(cacheKey, cached);
        return cached;
      } catch (error) {
        sessionStorage.removeItem(cacheKey);
        return null;
      }
    }

    function writeCachedRows(cacheKey, rows) {
      const cached = { timestamp: Date.now(), rows };
      state.queryCache.set(cacheKey, cached);
      try {
        sessionStorage.setItem(cacheKey, JSON.stringify(cached));
      } catch (error) {
        // Memory cache still prevents duplicate requests when storage is full.
      }
    }

    function revalidateTable(spec, limit, cacheKey) {
      if (state.inFlightRequests.has(cacheKey)) return;
      const promise = runSupabaseQuery(getClient(), spec, limit)
        .then((rows) => writeCachedRows(cacheKey, rows))
        .catch((error) => console.warn(`Background refresh failed for ${spec.table}`, error))
        .finally(() => state.inFlightRequests.delete(cacheKey));
      state.inFlightRequests.set(cacheKey, promise);
    }

    function clearQueryCache() {
      state.queryCache.clear();
      state.inFlightRequests.clear();
      Object.keys(sessionStorage)
        .filter((key) => key.startsWith(cachePrefix))
        .forEach((key) => sessionStorage.removeItem(key));
    }

    function withTimeoutIfNeeded(promise, spec, options, label) {
      if (!options.withTimeout) return promise;
      return options.withTimeout(promise, options.timeoutMs || 8_000, `${spec.table} ${label} timed out.`);
    }

    return Object.freeze({
      clearQueryCache,
      fetchTable,
      fetchTableSafe,
      normalizeLimit: (limit) => normalizeLimit(limit, pageSize),
      queryCacheKey,
      readCachedRows,
      revalidateTable,
      runSupabaseQuery,
      writeCachedRows
    });
  }

  window.JenovatePortalData = Object.freeze({
    createTableClient,
    isMissingColumnError,
    normalizeLimit
  });
})();
