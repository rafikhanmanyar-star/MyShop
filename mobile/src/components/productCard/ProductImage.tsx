import { memo, useCallback, useEffect, useState, type SyntheticEvent } from 'react';
import CachedImage from '../CachedImage';
import { resolveImageFitMode, type ImageFitMode } from './productCardUtils';

type Props = {
    path: string | undefined;
    alt: string;
    /** `grid` — browse/home catalog; `rail` — narrow horizontal scroll cells */
    layout?: 'grid' | 'rail';
};

function fitClass(mode: ImageFitMode): string {
    switch (mode) {
        case 'cover':
            return 'product-card__image--fit-cover';
        case 'contain-boost':
            return 'product-card__image--fit-contain-boost';
        default:
            return 'product-card__image--fit-contain';
    }
}

/**
 * Smart product image: adaptive object-fit, minimal padding, lazy load + skeleton.
 * On load, inspects aspect ratio to reduce dead space without distortion.
 */
function ProductImage({ path, alt, layout = 'grid' }: Props) {
    const [loaded, setLoaded] = useState(false);
    const [fitMode, setFitMode] = useState<ImageFitMode>('contain-boost');

    useEffect(() => {
        setLoaded(false);
        setFitMode('contain-boost');
    }, [path]);

    const handleLoad = useCallback(
        (e: SyntheticEvent<HTMLImageElement>) => {
            const img = e.currentTarget;
            setFitMode(resolveImageFitMode(img.naturalWidth, img.naturalHeight, path));
            setLoaded(true);
        },
        [path],
    );

    return (
        <div className={`product-card__media-inner product-card__media-inner--${layout}`}>
            {!loaded ? <div className="product-card__image-skeleton" aria-hidden /> : null}
            <CachedImage
                path={path}
                alt={alt}
                loading="lazy"
                fallbackLabel={alt}
                className={`product-card__image ${fitClass(fitMode)} ${loaded ? 'product-card__image--loaded' : ''}`}
                onLoad={handleLoad}
                onReady={() => setLoaded(true)}
            />
        </div>
    );
}

export default memo(ProductImage);
