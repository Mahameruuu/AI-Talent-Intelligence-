"""final HR hiring decision on applications (decision, note, decided_at, decided_by)

Revision ID: c3f9a1d7e2b5
Revises: b8d4e2f7c1a9
Create Date: 2026-10-26 20:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'c3f9a1d7e2b5'
down_revision = 'b8d4e2f7c1a9'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ti_applications', schema=None) as batch_op:
        batch_op.add_column(sa.Column('decision', sa.String(length=20), nullable=True))
        batch_op.add_column(sa.Column('decision_note', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('decided_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('decided_by_id', sa.Integer(), nullable=True))
        batch_op.create_foreign_key('fk_ti_applications_decided_by_id_ti_users', 'ti_users', ['decided_by_id'], ['id'])


def downgrade():
    with op.batch_alter_table('ti_applications', schema=None) as batch_op:
        batch_op.drop_constraint('fk_ti_applications_decided_by_id_ti_users', type_='foreignkey')
        batch_op.drop_column('decided_by_id')
        batch_op.drop_column('decided_at')
        batch_op.drop_column('decision_note')
        batch_op.drop_column('decision')
