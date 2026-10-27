"""job period times (opens_time/closes_time, WIB) and auto-invite timing

Applications open at ``opens_on opens_time`` (00:00 when null) and close at ``closes_on closes_time`` (end of the
day when null, i.e. unchanged for existing jobs). ``auto_invite_timing`` is ``next_morning`` (08:00 WIB the day
after closes_on, the previous behaviour) or ``on_close`` (right after the closing moment).

Revision ID: e5a1c7d9b3f2
Revises: d4e8b2a6f1c3
Create Date: 2026-10-27 14:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'e5a1c7d9b3f2'
down_revision = 'd4e8b2a6f1c3'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ti_jobs', schema=None) as batch_op:
        batch_op.add_column(sa.Column('opens_time', sa.Time(), nullable=True))
        batch_op.add_column(sa.Column('closes_time', sa.Time(), nullable=True))
        batch_op.add_column(sa.Column('auto_invite_timing', sa.String(length=20), server_default='next_morning',
                                      nullable=False))


def downgrade():
    with op.batch_alter_table('ti_jobs', schema=None) as batch_op:
        batch_op.drop_column('auto_invite_timing')
        batch_op.drop_column('closes_time')
        batch_op.drop_column('opens_time')
