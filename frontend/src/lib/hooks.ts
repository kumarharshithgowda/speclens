import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

/** Invalidate every cached query — mutations here touch many views (coverage, dashboard, alerts). */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(() => qc.invalidateQueries(), [qc]);
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function usePagination<T>(items: T[], pageSize = 25) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  useEffect(() => {
    if (page > pages) setPage(1);
  }, [page, pages]);
  const slice = items.slice((page - 1) * pageSize, page * pageSize);
  return { page, pages, setPage, slice, total: items.length, pageSize };
}
