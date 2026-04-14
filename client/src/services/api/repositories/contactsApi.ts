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
    const q = query.trim();
    if (q.length >= 1) {
      return this.findAll(q);
    }
    return this.findAll();
  }

  async createContact(data: { name: string; type?: ContactType; contactNo?: string; companyName?: string }): Promise<Contact> {
    const created = await khataApi.createCustomer({
      name: data.name,
      contactNo: data.contactNo,
      companyName: data.companyName,
    });
    return toContact(created);
  }

  async findAll(searchQuery?: string): Promise<Contact[]> {
    const q = searchQuery?.trim();
    const rows = await khataApi.getCustomers(q ? { q } : undefined);
    return (Array.isArray(rows) ? rows : []).map(toContact);
  }

  async findById(id: string): Promise<Contact | null> {
    const all = await this.findAll();
    return all.find((c) => c.id === id) ?? null;
  }
}
