export class AccountRepository {
  constructor(store) {
    this.store = store;
  }
  list(lock = false) {
    return this.store.list("accounts", lock);
  }
  create(account) {
    return this.store.insert("accounts", account);
  }
  async findByIdentifier(identifier) {
    const key = identifier.toLowerCase();
    return (await this.list()).find(
      (row) => row.username.toLowerCase() === key || row.email === key,
    );
  }
}
