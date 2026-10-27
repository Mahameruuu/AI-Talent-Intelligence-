"""remove HR login: ti_users becomes an actors table (attribution only); drop reviewer assignment

Authentication and permissions are handled by the central system. ``ti_users`` is kept (history rows reference it)
but loses every credential/login column: password_hash, email, role, is_active. Actors are identified by an
optional ``external_id`` (X-Actor-Id header) or by name (X-Actor-Name header). ``ti_applications.assigned_reviewer_id``
is dropped together with reviewer scoping.

Revision ID: d4e8b2a6f1c3
Revises: c3f9a1d7e2b5
Create Date: 2026-10-27 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'd4e8b2a6f1c3'
down_revision = 'c3f9a1d7e2b5'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ti_users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('external_id', sa.String(length=255), nullable=True))
        batch_op.create_unique_constraint('uq_ti_users_external_id', ['external_id'])
        batch_op.drop_column('password_hash')
        batch_op.drop_column('email')  # also drops its unique constraint
        batch_op.drop_column('role')
        batch_op.drop_column('is_active')

    with op.batch_alter_table('ti_applications', schema=None) as batch_op:
        batch_op.drop_column('assigned_reviewer_id')  # also drops its foreign key


def downgrade():
    # Credentials are not restored: former accounts get a placeholder email/role and an unusable password hash.
    with op.batch_alter_table('ti_applications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('assigned_reviewer_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('ti_applications_assigned_reviewer_id_fkey', 'ti_users',
                                    ['assigned_reviewer_id'], ['id'])

    with op.batch_alter_table('ti_users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('is_active', sa.Boolean(), nullable=False, server_default=sa.false()))
        batch_op.add_column(sa.Column('role', sa.String(length=20), nullable=False, server_default='reviewer'))
        batch_op.add_column(sa.Column('email', sa.String(length=255), nullable=True))
        batch_op.add_column(sa.Column('password_hash', sa.String(length=255), nullable=False, server_default='!'))
    op.execute("UPDATE ti_users SET email = 'actor-' || id || '@invalid.local'")
    with op.batch_alter_table('ti_users', schema=None) as batch_op:
        batch_op.alter_column('email', nullable=False)
        batch_op.create_unique_constraint('ti_users_email_key', ['email'])
        batch_op.drop_constraint('uq_ti_users_external_id', type_='unique')
        batch_op.drop_column('external_id')
