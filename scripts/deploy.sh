#!/bin/bash
# Light Protocol V2 CPI Reproducer - Deployment Script
# This script builds and deploys the Anchor program to devnet

set -e

echo "=== Light Protocol V2 CPI Reproducer - Deployment ==="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check for required tools
check_tool() {
    if ! command -v $1 &> /dev/null; then
        echo -e "${RED}Error: $1 is not installed${NC}"
        exit 1
    fi
}

echo "Checking required tools..."
check_tool "anchor"
check_tool "solana"
check_tool "cargo"
echo -e "${GREEN}All tools available${NC}"
echo ""

# Navigate to anchor directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANCHOR_DIR="$SCRIPT_DIR/../anchor"

if [ ! -d "$ANCHOR_DIR" ]; then
    echo -e "${RED}Error: Anchor directory not found at $ANCHOR_DIR${NC}"
    exit 1
fi

cd "$ANCHOR_DIR"
echo "Working directory: $(pwd)"
echo ""

# Check Solana configuration
echo "Checking Solana configuration..."
CLUSTER=$(solana config get | grep "RPC URL" | awk '{print $3}')
KEYPAIR=$(solana config get | grep "Keypair" | awk '{print $3}')

echo "  Cluster: $CLUSTER"
echo "  Keypair: $KEYPAIR"

if [[ ! "$CLUSTER" == *"devnet"* ]]; then
    echo -e "${YELLOW}Warning: Not connected to devnet. Switching...${NC}"
    solana config set --url devnet
fi
echo ""

# Check balance
BALANCE=$(solana balance --lamports 2>/dev/null || echo "0")
echo "Wallet balance: $(echo "scale=4; $BALANCE / 1000000000" | bc) SOL"

if [ "$BALANCE" -lt 1000000000 ]; then
    echo -e "${YELLOW}Warning: Low balance. Requesting airdrop...${NC}"
    solana airdrop 2
    sleep 5
fi
echo ""

# Build the program
echo "=== Building Anchor program ==="
anchor build

if [ $? -ne 0 ]; then
    echo -e "${RED}Build failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Build successful${NC}"
echo ""

# Get program ID from keypair
PROGRAM_KEYPAIR="$ANCHOR_DIR/target/deploy/light_nft_reproducer-keypair.json"
if [ -f "$PROGRAM_KEYPAIR" ]; then
    PROGRAM_ID=$(solana address -k "$PROGRAM_KEYPAIR")
    echo "Program ID: $PROGRAM_ID"

    # Update program ID in source files
    echo ""
    echo "Updating program ID in source files..."

    # Update lib.rs
    sed -i '' "s/REPRoDucerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/$PROGRAM_ID/g" \
        "$ANCHOR_DIR/programs/light_nft_reproducer/src/lib.rs" 2>/dev/null || true

    # Update Anchor.toml
    sed -i '' "s/REPRoDucerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/$PROGRAM_ID/g" \
        "$ANCHOR_DIR/Anchor.toml" 2>/dev/null || true

    # Update .env.local
    ENV_FILE="$SCRIPT_DIR/../app/.env.local"
    if [ -f "$ENV_FILE" ]; then
        sed -i '' "s/REPRoDucerXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX/$PROGRAM_ID/g" \
            "$ENV_FILE" 2>/dev/null || true
    fi

    echo -e "${GREEN}Program ID updated${NC}"
else
    echo -e "${YELLOW}Warning: Program keypair not found. Build may not have created it.${NC}"
fi
echo ""

# Rebuild with correct program ID
echo "=== Rebuilding with correct program ID ==="
anchor build

if [ $? -ne 0 ]; then
    echo -e "${RED}Rebuild failed!${NC}"
    exit 1
fi
echo -e "${GREEN}Rebuild successful${NC}"
echo ""

# Deploy
echo "=== Deploying to Devnet ==="
anchor deploy --provider.cluster devnet

if [ $? -ne 0 ]; then
    echo -e "${RED}Deploy failed!${NC}"
    echo ""
    echo "Common issues:"
    echo "  1. Insufficient SOL - run 'solana airdrop 2'"
    echo "  2. Program already deployed - run 'anchor upgrade' instead"
    echo "  3. Network issues - try again later"
    exit 1
fi

echo ""
echo -e "${GREEN}=== Deployment Successful ===${NC}"
echo ""
echo "Program ID: $PROGRAM_ID"
echo "Explorer: https://explorer.solana.com/address/$PROGRAM_ID?cluster=devnet"
echo ""
echo "Next steps:"
echo "  1. Run: npx ts-node scripts/register-program.ts"
echo "  2. Start app: cd app && yarn dev"
echo ""
