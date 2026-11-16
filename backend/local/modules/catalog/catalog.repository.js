export class CatalogRepository {
  constructor(store) {
    this.store = store;
  }
  async all(lock = false) {
    const result = {};
    for (const kind of ["cohorts", "faculties", "majors", "classes"])
      result[kind] = await this.store.list(kind, lock);
    return result;
  }
  create(kind, record) {
    return this.store.insert(kind, record);
  }
  update(kind, id, changes, version) {
    return this.store.update(kind, id, changes, version);
  }
}
