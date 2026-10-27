"""conversational interview mode (template.mode, session.mode, message.mode_used)

Revision ID: b8d4e2f7c1a9
Revises: a7c3e9f1b2d4
Create Date: 2026-10-26 18:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b8d4e2f7c1a9'
down_revision = 'a7c3e9f1b2d4'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('ti_interview_templates', schema=None) as batch_op:
        batch_op.add_column(sa.Column('mode', sa.String(length=20), server_default='template', nullable=False))
    with op.batch_alter_table('ti_interview_sessions', schema=None) as batch_op:
        batch_op.add_column(sa.Column('mode', sa.String(length=20), server_default='template', nullable=False))
    with op.batch_alter_table('ti_interview_messages', schema=None) as batch_op:
        batch_op.add_column(sa.Column('mode_used', sa.String(length=10), nullable=True))


def downgrade():
    with op.batch_alter_table('ti_interview_messages', schema=None) as batch_op:
        batch_op.drop_column('mode_used')
    with op.batch_alter_table('ti_interview_sessions', schema=None) as batch_op:
        batch_op.drop_column('mode')
    with op.batch_alter_table('ti_interview_templates', schema=None) as batch_op:
        batch_op.drop_column('mode')
