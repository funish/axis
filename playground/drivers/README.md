# DNS Drivers Examples

This directory contains example code for testing different DNS drivers in the undns library.

## Available Examples

### Node.js DNS Driver (`node.ts`)

- **Purpose**: Read-only DNS resolution using standard DNS servers
- **Usage**: Testing DNS queries and record retrieval
- **Features**:
  - Query any public domain
  - Support for all standard DNS record types
  - No authentication required
  - Read-only operations

### Cloudflare DNS Driver (`cloudflare.ts`)

- **Purpose**: Full DNS management through Cloudflare API
- **Usage**: Managing DNS records in Cloudflare zones
- **Features**:
  - Read and write operations
  - Requires Cloudflare API token
  - Only works for domains in your Cloudflare account
  - Supports all Cloudflare DNS record types

## Getting Started

### 1. Node.js Driver (No setup required)

```bash
cd playground
pnpm ts-node drivers/node.ts
```

### 2. Cloudflare Driver (Requires setup)

#### Step 1: Get Cloudflare API Token

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Create a new API token with these permissions:
   - **Zone**: Zone:Read, Zone:Edit
   - **DNS**: DNS:Read, DNS:Edit
   - **Zone Resources**: Include all zones or specific domains

#### Step 2: Set environment variable

```bash
export CLOUDFLARE_API_TOKEN="your-api-token-here"
```

#### Step 3: Update the domain in the code

Edit `cloudflare.ts` and change:

```typescript
const testDomain = "your-domain.com"; // Replace with your actual domain
```

#### Step 4: Run the test

```bash
cd playground
pnpm ts-node drivers/cloudflare.ts
```

## Key Differences

| Feature          | Node.js Driver       | Cloudflare Driver          |
| ---------------- | -------------------- | -------------------------- |
| Authentication   | None                 | API Token Required         |
| Write Operations | ❌ No                | ✅ Yes                     |
| Record ID        | None                 | ✅ Available               |
| Scope            | Any public domain    | Your Cloudflare zones only |
| Use Case         | DNS queries, testing | DNS management, automation |

## Testing Write Operations

The Cloudflare driver example includes commented-out write operation code. To test creating and deleting records:

1. Uncomment the write operation section in `cloudflare.ts`
2. Ensure your API token has write permissions
3. Run with caution - this will create and delete real DNS records

## Troubleshooting

### Cloudflare Driver Issues

**401 Unauthorized**:

- Check API token is correct and not expired
- Verify token has required permissions

**403 Forbidden**:

- Token lacks necessary permissions
- Add DNS:Edit permission for write operations

**Zone not found**:

- Domain must be in your Cloudflare account
- Check for typos in domain name
- Verify token includes access to the specific zone

### Node.js Driver Issues

**DNS resolution failures**:

- Check network connectivity
- Try different DNS servers in the driver options
- Some domains may block certain record types
