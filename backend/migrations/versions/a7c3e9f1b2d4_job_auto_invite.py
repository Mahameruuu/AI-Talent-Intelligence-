"""job auto invite (scheduled AI-interview invitations after the application period closes)

Revision ID: a7c3e9f1b2d4
Revises: 0323694a2994
Create Date: 2026-10-26 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = 'a7c3e9f1b2d4'
down_revision = '0323694a2994'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ti_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('auto_invite_enabled', sa.Boolean(), server_default='true', nullable=False))
        batch_op.add_column(sa.Column('auto_invite_top_n', sa.Integer(), server_default='10', nullable=False))
        batch_op.add_column(sa.Column('auto_invite_min_score', sa.Float(), nullable=True))
        batch_op.add_column(sa.Column('auto_invite_ran_at', sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column('auto_invite_result', postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        batch_op.add_column(sa.Column('auto_invite_error', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('auto_invite_claimed_at', sa.DateTime(timezone=True), nullable=True))


def downgrade():
    with op.batch_alter_table('ti_jobs', schema=None) as batch_op:
        batch_op.drop_column('auto_invite_claimed_at')
        batch_op.drop_column('auto_invite_error')
        batch_op.drop_column('auto_invite_result')
        batch_op.drop_column('auto_invite_ran_at')
        batch_op.drop_column('auto_invite_min_score')
        batch_op.drop_column('auto_invite_top_n')
        batch_op.drop_column('auto_invite_enabled')
