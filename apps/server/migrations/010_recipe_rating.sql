-- Optional household rating for a recipe, 1 to 5 stars. NULL means not rated.
ALTER TABLE recipes ADD COLUMN rating INTEGER CHECK (rating BETWEEN 1 AND 5);
