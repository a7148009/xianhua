const { cloudInitializer } = require("./cloud-init.js");

class DatabaseManager {
  constructor() {
    this.db = null;
    this.collections = {};
  }

  async initDatabase() {
    try {
      const initResult = await cloudInitializer.init();
      if (!initResult.success) {
        throw new Error(initResult.message || "云开发初始化失败");
      }
      if (!this.db) {
        this.db = wx.cloud.database();
      }
      return true;
    } catch (err) {
      console.error("[db-manager] initDatabase error", err);
      return false;
    }
  }

  getCollection(name) {
    if (!this.db) {
      throw new Error("数据库未初始化");
    }
    if (!this.collections[name]) {
      this.collections[name] = this.db.collection(name);
    }
    return this.collections[name];
  }

  async ensureCollection(name) {
    await this.initDatabase();
    return this.getCollection(name);
  }

  async increaseViewCount(hashId) {
    try {
      const col = await this.ensureCollection('db_info');
      return await col.where({ hash_id: hashId }).update({
        data: { view_count: this.db.command.inc(1) }
      });
    } catch (err) {
      console.error("[db-manager] increaseViewCount", err);
      return null;
    }
  }
}

module.exports = new DatabaseManager();
