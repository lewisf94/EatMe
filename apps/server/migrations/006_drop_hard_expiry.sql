-- Remove the category-level "hard expiry" flag. Safety now comes only from a
-- pack's explicit use-by date (see DM / computeStatus), so a category flag that
-- claimed to turn a best-before into a safety deadline was misleading and unused.
ALTER TABLE categories DROP COLUMN hard_expiry;
