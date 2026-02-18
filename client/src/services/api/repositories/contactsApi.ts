export class ContactsApiRepository {
  async getContacts(): Promise<any[]> { return []; }
  async searchContacts(query: string): Promise<any[]> { return []; }
  async createContact(data: any): Promise<any> { return data; }
  async findAll(): Promise<any[]> { return []; }
  async findById(id: string): Promise<any> { return null; }
}
