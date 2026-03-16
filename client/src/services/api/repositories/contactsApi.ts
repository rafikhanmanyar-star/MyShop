import { khataApi } from '../../shopApi';
import { Contact, ContactType } from '../../../types';

function toContact(row: { id: string; name: string; contact_no: string | null; company_name?: string | null }): Contact {
  return {
    id: row.id,
    name: row.name,
    type: ContactType.CLIENT,
    contactNo: row.contact_no ?? undefined,
    companyName: row.company_name ?? undefined,
  };
}

export class ContactsApiRepository {
  async getContacts(): Promise<Contact[]> {
    return this.findAll();
  }

  async searchContacts(query: string): Promise<Contact[]> {
    const all = await this.findAll();
    const q = query.toLowerCase().trim();
    if (!q) return all;
    return all.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.contactNo && c.contactNo.includes(query)) ||
        (c.companyName && c.companyName.toLowerCase().includes(q))
    );
  }

  async createContact(data: { name: string; type?: ContactType; contactNo?: string; companyName?: string }): Promise<Contact> {
    const created = await khataApi.createCustomer({
      name: data.name,
      contactNo: data.contactNo,
      companyName: data.companyName,
    });
    return toContact(created);
  }

  async findAll(): Promise<Contact[]> {
    const rows = await khataApi.getCustomers();
    return (Array.isArray(rows) ? rows : []).map(toContact);
  }

  async findById(id: string): Promise<Contact | null> {
    const all = await this.findAll();
    return all.find((c) => c.id === id) ?? null;
  }
}
