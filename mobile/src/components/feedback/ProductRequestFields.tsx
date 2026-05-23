type ProductRequest = {
    productName: string;
    brand: string;
    category: string;
    notes: string;
    barcode: string;
};

type Props = {
    value: ProductRequest;
    onChange: (v: ProductRequest) => void;
    categories?: string[];
};

export default function ProductRequestFields({ value, onChange, categories = [] }: Props) {
    return (
        <div className="fb-card fb-product-req">
            <h3 className="fb-card__title">Product recommendation</h3>
            <label className="fb-field">
                <span>Product name *</span>
                <input
                    type="text"
                    value={value.productName}
                    onChange={(e) => onChange({ ...value, productName: e.target.value })}
                    placeholder="e.g. Organic almond milk"
                    maxLength={200}
                />
            </label>
            <div className="fb-field-row">
                <label className="fb-field">
                    <span>Brand</span>
                    <input
                        type="text"
                        value={value.brand}
                        onChange={(e) => onChange({ ...value, brand: e.target.value })}
                        placeholder="Optional"
                        maxLength={120}
                    />
                </label>
                <label className="fb-field">
                    <span>Category</span>
                    {categories.length ? (
                        <select value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value })}>
                            <option value="">Select</option>
                            {categories.map((c) => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    ) : (
                        <input
                            type="text"
                            value={value.category}
                            onChange={(e) => onChange({ ...value, category: e.target.value })}
                            placeholder="Optional"
                            maxLength={120}
                        />
                    )}
                </label>
            </div>
            <label className="fb-field">
                <span>Notes</span>
                <input
                    type="text"
                    value={value.notes}
                    onChange={(e) => onChange({ ...value, notes: e.target.value })}
                    placeholder="Size, flavor, etc."
                    maxLength={500}
                />
            </label>
            <label className="fb-field">
                <span>Barcode (optional)</span>
                <input
                    type="text"
                    inputMode="numeric"
                    value={value.barcode}
                    onChange={(e) => onChange({ ...value, barcode: e.target.value })}
                    placeholder="Scan or enter barcode"
                    maxLength={64}
                />
            </label>
        </div>
    );
}
