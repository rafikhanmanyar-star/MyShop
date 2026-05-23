import { getFullImageUrl } from '../../api';

type Attachment = { id?: string; url: string; file?: File; preview?: string };

type Props = {
    items: Attachment[];
    onChange: (items: Attachment[]) => void;
    max?: number;
};

export default function ImageAttachments({ items, onChange, max = 4 }: Props) {
    const addFiles = (files: FileList | null) => {
        if (!files?.length) return;
        const next = [...items];
        for (const file of Array.from(files)) {
            if (!file.type.startsWith('image/') || next.length >= max) continue;
            next.push({ url: '', file, preview: URL.createObjectURL(file) });
        }
        onChange(next);
    };

    const removeAt = (idx: number) => {
        const copy = [...items];
        const removed = copy.splice(idx, 1)[0];
        if (removed?.preview) URL.revokeObjectURL(removed.preview);
        onChange(copy);
    };

    return (
        <div className="fb-card">
            <h3 className="fb-card__title">Photos</h3>
            <p className="fb-card__hint">Attach photos for damaged items, missing products, or recommendations.</p>
            <div className="fb-attachments">
                {items.map((item, i) => (
                    <div key={item.preview || item.url || i} className="fb-attachment-thumb">
                        <img src={item.preview || getFullImageUrl(item.url) || ''} alt="" />
                        <button type="button" className="fb-attachment-remove" aria-label="Remove" onClick={() => removeAt(i)}>×</button>
                    </div>
                ))}
                {items.length < max && (
                    <label className="fb-attachment-add">
                        <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            hidden
                            onChange={(e) => {
                                addFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <span>+</span>
                    </label>
                )}
                {items.length < max && (
                    <label className="fb-attachment-add fb-attachment-add--gallery">
                        <input
                            type="file"
                            accept="image/*"
                            hidden
                            multiple
                            onChange={(e) => {
                                addFiles(e.target.files);
                                e.target.value = '';
                            }}
                        />
                        <span>Gallery</span>
                    </label>
                )}
            </div>
        </div>
    );
}

export type { Attachment as FeedbackAttachmentItem };
