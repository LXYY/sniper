use anchor_lang::prelude::*;

use crate::state::Snipe;

#[derive(Accounts)]
#[instruction()]
pub struct InitSnipe<'info> {
  #[account(
		init,
		payer = payer,
		space = 8 + Snipe::INIT_SPACE,
		seeds = [
			b"snipe",
		  payer.key().as_ref(),
		  sniped_token_mint.key().as_ref(),
		],
		bump,
	)]
  pub snipe: Box<Account<'info, Snipe>>,
  #[account(mut)]
  pub payer: Signer<'info>,
  /// CHECK: the account doesn't matter.
  pub sniped_token_mint: AccountInfo<'info>,
  pub system_program: Program<'info, System>,
}

pub fn handler(ctx: Context<InitSnipe>) -> Result<()> {
  let snipe = &mut ctx.accounts.snipe;
  snipe.bump = ctx.bumps.snipe;
  Ok(())
}
