import { memo } from 'react';
import { Link } from 'react-router-dom';
import CachedImage from './CachedImage';

export type RecipeCardData = {
    id: string;
    title: string;
    image_url?: string | null;
    prep_time_minutes?: number;
    difficulty?: string | null;
    category_id?: string | null;
    /** Present on mobile list/detail payloads for grouping and labels */
    category_name?: string | null;
};

const RecipeCard = memo(function RecipeCard({
    recipe,
    shopSlug,
}: {
    recipe: RecipeCardData;
    shopSlug: string;
}) {
    return (
        <Link to={`/${shopSlug}/recipes/${recipe.id}`} className="recipe-card recipe-card--list-row">
            <div className="recipe-card__thumb">
                <CachedImage
                    path={recipe.image_url || undefined}
                    alt={recipe.title}
                    className="recipe-card__img"
                    loading="lazy"
                    fallbackLabel={recipe.title}
                    fallbackClassName="recipe-card__img-fallback"
                />
            </div>
            <div className="recipe-card__body recipe-card__body--row">
                <h3 className="recipe-card__title recipe-card__title--row">{recipe.title}</h3>
            </div>
        </Link>
    );
});

export default RecipeCard;
