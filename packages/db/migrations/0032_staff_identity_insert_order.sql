-- The link's foreign key requires the newly inserted user to exist before capture.
DROP TRIGGER users_staff_identity ON users;
CREATE TRIGGER users_staff_identity AFTER INSERT OR UPDATE OF phone,email,phone_verified_at,email_verified_at ON users FOR EACH ROW EXECUTE FUNCTION preserve_staff_user_identity();
