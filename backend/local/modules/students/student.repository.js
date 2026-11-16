export class StudentRepository {
  constructor(store) {
    this.store = store;
  }
  list() {
    return this.store.list("students");
  }
  create(record) {
    return this.store.insert("students", record);
  }
  update(id, changes, version) {
    return this.store.update("students", id, changes, version);
  }
}
