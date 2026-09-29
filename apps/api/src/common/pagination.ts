export function paginate(page?: number | string, pageSize?: number | string) {
  const p = Math.max(1, Number(page) || 1);
  const ps = Math.min(100, Math.max(1, Number(pageSize) || 20));
  return {
    skip: (p - 1) * ps,
    take: ps,
    page: p,
    pageSize: ps,
  };
}

export function pageResult<T>(items: T[], total: number, page: number, pageSize: number) {
  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize) || 1,
  };
}
