export type SniperHelper = {
  "version": "0.1.0",
  "name": "sniper_helper",
  "instructions": [
    {
      "name": "initSnipe",
      "accounts": [
        {
          "name": "snipe",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "snipedTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "checkTokenAmount",
      "accounts": [
        {
          "name": "tokenAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "minAmount",
          "type": "u64"
        },
        {
          "name": "maxAmount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "snipe",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidTokenAmountCheckingInput",
      "msg": "invalid token amount checking input"
    },
    {
      "code": 6001,
      "name": "InvalidTokenAmount",
      "msg": "invalid token amount"
    }
  ]
};

export const IDL: SniperHelper = {
  "version": "0.1.0",
  "name": "sniper_helper",
  "instructions": [
    {
      "name": "initSnipe",
      "accounts": [
        {
          "name": "snipe",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "snipedTokenMint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "checkTokenAmount",
      "accounts": [
        {
          "name": "tokenAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "minAmount",
          "type": "u64"
        },
        {
          "name": "maxAmount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "snipe",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "InvalidTokenAmountCheckingInput",
      "msg": "invalid token amount checking input"
    },
    {
      "code": 6001,
      "name": "InvalidTokenAmount",
      "msg": "invalid token amount"
    }
  ]
};
