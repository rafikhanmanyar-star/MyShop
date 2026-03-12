-- Store which bank was used for "paid at purchase" so we can reverse accounting on edit/delete
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS initial_payment_bank_account_id TEXT REFERENCES shop_bank_accounts(id) ON DELETE SET NULL;
