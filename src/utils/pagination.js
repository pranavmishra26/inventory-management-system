// Turns ?page=&limit= into Prisma's skip/take, and builds the response `meta`.
// Spring equivalent: Pageable -> Page<T>.

function toSkipTake({ page, limit }) {
  return { skip: (page - 1) * limit, take: limit };
}

function buildMeta({ page, limit }, total) {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

module.exports = { toSkipTake, buildMeta };
