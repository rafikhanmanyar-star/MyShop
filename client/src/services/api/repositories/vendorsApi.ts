import { shopApi, ShopVendor } from '../../shopApi';

function toApi(data: any) {
  return {
    name: data.name,
    company_name: data.companyName ?? data.company_name,
    contact_no: data.contactNo ?? data.contact_no,
    email: data.email,
    address: data.address,
    description: data.description,
  };
}

function toState(v: ShopVendor) {
  return {
    id: v.id,
    name: v.name,
    companyName: v.company_name,
    contactNo: v.contact_no,
    email: v.email,
    address: v.address,
    description: v.description,
  };
}

export class VendorsApiRepository {
  async getVendors(): Promise<any[]> {
    const list = await shopApi.getVendors();
    return (Array.isArray(list) ? list : []).map(toState);
  }

  async createVendor(data: any): Promise<any> {
    const created = await shopApi.createVendor(toApi(data));
    return toState(created);
  }

  async create(data: any): Promise<any> {
    return this.createVendor(data);
  }

  async update(id: string, data: any): Promise<any> {
    await shopApi.updateVendor(id, toApi(data));
    return { id, ...toState({ ...data, id } as any) };
  }

  async delete(id: string): Promise<void> {
    await shopApi.deleteVendor(id);
  }
}
