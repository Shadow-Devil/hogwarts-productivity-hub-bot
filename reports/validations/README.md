# Bot Health & Validation Reports

## Purpose
This directory contains automated health and validation reports for the Discord bot. These reports help the server owner understand:

- Bot system health and performance
- Configuration validation status
- Feature functionality verification
- Troubleshooting information for common issues

**For Server Owners**: These reports are generated automatically and help you monitor your bot's health without technical expertise.

## Report Types

### Phase Validation Reports
- `phase-start-{phase}-{timestamp}.json` - Pre-requisite validation before phase start
- `phase-completion-{phase}-{timestamp}.json` - Completion criteria validation

### Health Reports
- `roadmap-health-{timestamp}.json` - Overall system health assessment

## Operational Use

## For Server Owners

### Quick Health Check
Run this command to check if your bot is healthy:
```bash
npm run milestone-health
```

### Understanding Reports
- **Green status**: Everything is working correctly
- **Yellow status**: Minor issues, bot still functional
- **Red status**: Serious issues, may need developer assistance

### When to Contact Developer
- Multiple red status reports
- Bot stops responding to commands
- Database connection errors
- Timezone reset failures

### Maintenance Commands
```bash
# Check bot health
npm run milestone-health

# Validate bot configuration
npm run audit-compliance phase-1-foundation

# Run full system test
npm test
```

## Retention Policy

### Git Repository
- Sample reports are committed for documentation
- Bulk generated reports are gitignored but retained locally
- Production reports should be shipped to centralized logging (ELK/Datadog)

### Local Development
- Reports older than 7 days can be cleaned up locally
- Use `npm run cleanup-reports` (when implemented) for maintenance

## Integration Points

### CI/CD Pipeline
```bash
# Validate before deployment
npm run milestone-validate-complete phase-1-foundation
if [ $? -ne 0 ]; then
  echo "Phase validation failed - blocking deployment"
  exit 1
fi
```

### Monitoring & Alerting
- Parse JSON reports for metrics
- Alert on validation failures
- Dashboard integration for visibility

## Security Considerations
- Reports may contain sensitive project information
- Don't commit reports with secrets or tokens
- Sanitize before sharing externally

---
*This is operational infrastructure - treat as production monitoring data*
