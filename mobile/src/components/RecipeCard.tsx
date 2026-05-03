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
};

const RecipeCard = memo(function RecipeCard({
    recipe,
    shopSlug,
}: {
    recipe: RecipeCardData;
    shopSlug: string;
}) {
    const prep = recipe.prep_time_minutes != null ? `${recipe.prep_time_minutes} min prep` : '';
    return (
        <Link to={`/${shopSlug}/recipes/${recipe.id}`} className="recipe-card">
            <div className="recipe-card__img-wrap">
                <CachedImage
                    path={recipe.image_url || undefined}
                    alt=""
                    className="recipe-card__img"
                    loading="lazy"
                    fallbackLabel={recipe.title}
                    fallbackClassName="recipe-card__img-fallback"
                />
            </div>
            <div className="recipe-card__body">
                <h3 className="recipe-card__title">{recipe.title}</h3>
                <div className="recipe-card__meta">
                    {prep && <span>{prep}</span>}
                    {recipe.difficulty && <span className="recipe-card__diff">{recipe.difficulty}</span>}
                </div>
            </div>
        </Link>
    );
});

export default RecipeCard;
