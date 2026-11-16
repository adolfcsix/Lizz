// Repository AI chỉ lưu hội thoại/đề xuất. Giao dịch nghiệp vụ dùng service gốc.
export class AiRepository {
  constructor(store) {
    this.store = store;
  }
  async ownedConversation(id, actor, lock = false) {
    return (await this.store.list("conversations", lock)).find(
      (row) =>
        row.id === id &&
        row.actorId === actor.id &&
        row.accountVersion === actor.version,
    );
  }
  async proposals(conversationId, actor, lock = false) {
    return (await this.store.list("proposals", lock)).filter(
      (row) =>
        row.conversationId === conversationId && row.actorId === actor.id,
    );
  }
  createConversation(row) {
    return this.store.insert("conversations", row);
  }
  createProposal(row) {
    return this.store.insert("proposals", row);
  }
  updateConversation(id, values, version) {
    return this.store.update("conversations", id, values, version);
  }
  updateProposal(id, values, version) {
    return this.store.update("proposals", id, values, version);
  }
}
