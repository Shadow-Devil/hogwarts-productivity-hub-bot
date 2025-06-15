#!/usr/bin/env node

/**
 * GitHub Roadmap Sync
 *
 * Syncs the Strategic Product Analysis & Implementation Roadmap
 * with GitHub Issues and Projects.
 *
 * Uses GitHub's native project management instead of custom JSON files.
 */

const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

class RoadmapSync {
    constructor() {
        this.octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN
        });

        this.repo = {
            owner: process.env.GITHUB_OWNER || 'ayan',
            repo: process.env.GITHUB_REPO || 'botd'
        };

        this.phases = [
            {
                title: 'Phase 1: Product Foundation Audit',
                branch: 'product-foundation-audit',
                duration: '2-3 weeks',
                description: 'Deep architectural analysis and baseline establishment'
            },
            {
                title: 'Phase 2: Point System Redesign',
                branch: 'point-system-overhaul',
                duration: '3-4 weeks',
                description: 'Complete overhaul of the points and rewards system'
            },
            {
                title: 'Phase 3: Command Enhancement',
                branch: 'command-system-redesign',
                duration: '2-3 weeks',
                description: 'Modern slash command implementation and UX improvements'
            },
            {
                title: 'Phase 4: Infrastructure Hardening',
                branch: 'infrastructure-hardening',
                duration: '2-3 weeks',
                description: 'Scalability, performance, and reliability improvements'
            },
            {
                title: 'Phase 5: Integration & Testing',
                branch: 'integration-testing',
                duration: '1-2 weeks',
                description: 'Comprehensive testing and production deployment'
            }
        ];
    }

    /**
     * Create GitHub issues for each roadmap phase
     */
    async createPhaseIssues() {
        console.log('📋 Creating GitHub issues for roadmap phases...');

        const roadmapPath = path.join(__dirname, '../docs/roadmaps/STRATEGIC_PRODUCT_ANALYSIS_IMPLEMENTATION_ROADMAP.md');
        const roadmapContent = fs.readFileSync(roadmapPath, 'utf8');

        for (const phase of this.phases) {
            try {
                // Check if issue already exists
                const existingIssues = await this.octokit.rest.issues.listForRepo({
                    ...this.repo,
                    state: 'all'
                });

                const existingIssue = existingIssues.data.find(issue =>
                    issue.title.includes(phase.title)
                );

                if (existingIssue) {
                    console.log(`✅ ${phase.title} - Issue already exists (#${existingIssue.number})`);
                    continue;
                }

                // Extract phase content from roadmap
                const phaseRegex = new RegExp(`## ${phase.title}[\\s\\S]*?(?=## |$)`, 'g');
                const phaseMatch = roadmapContent.match(phaseRegex);
                const phaseContent = phaseMatch ? phaseMatch[0] : phase.description;

                // Create the issue
                const issue = await this.octokit.rest.issues.create({
                    ...this.repo,
                    title: phase.title,
                    body: `
## Overview
${phase.description}

**Duration**: ${phase.duration}
**Branch**: \`${phase.branch}\`

## Details
${phaseContent}

---
*This issue was automatically created from the Strategic Product Analysis & Implementation Roadmap*
                    `.trim(),
                    labels: ['roadmap', 'epic'],
                    milestone: null // Could be set if milestones are created
                });

                console.log(`✅ ${phase.title} - Created issue #${issue.data.number}`);
            } catch (error) {
                console.error(`❌ Failed to create issue for ${phase.title}:`, error.message);
            }
        }
    }

    /**
     * Update roadmap progress based on GitHub activity
     */
    async syncProgress() {
        console.log('🔄 Syncing roadmap progress from GitHub...');

        for (const phase of this.phases) {
            try {
                // Check if branch exists
                let branchExists = false;
                try {
                    await this.octokit.rest.repos.getBranch({
                        ...this.repo,
                        branch: phase.branch
                    });
                    branchExists = true;
                } catch (error) {
                    // Branch doesn't exist
                }

                // Get related issues
                const issues = await this.octokit.rest.issues.listForRepo({
                    ...this.repo,
                    state: 'all'
                });

                const phaseIssue = issues.data.find(issue =>
                    issue.title.includes(phase.title)
                );

                const status = this.calculatePhaseStatus(branchExists, phaseIssue);
                console.log(`📊 ${phase.title}: ${status}`);

            } catch (error) {
                console.error(`❌ Failed to sync progress for ${phase.title}:`, error.message);
            }
        }
    }

    /**
     * Calculate phase status based on GitHub activity
     */
    calculatePhaseStatus(branchExists, phaseIssue) {
        if (phaseIssue && phaseIssue.state === 'closed') {
            return '✅ COMPLETED';
        }

        if (branchExists) {
            return '🔄 IN PROGRESS';
        }

        if (phaseIssue && phaseIssue.state === 'open') {
            return '📋 PLANNED';
        }

        return '⏳ NOT STARTED';
    }

    /**
     * Generate roadmap status report
     */
    async generateStatusReport() {
        console.log('📊 Generating roadmap status report...');

        const report = {
            timestamp: new Date().toISOString(),
            phases: []
        };

        for (const phase of this.phases) {
            try {
                // Check branch
                let branchExists = false;
                let commits = 0;
                try {
                    await this.octokit.rest.repos.getBranch({
                        ...this.repo,
                        branch: phase.branch
                    });
                    branchExists = true;

                    // Get commits in branch
                    const branchCommits = await this.octokit.rest.repos.listCommits({
                        ...this.repo,
                        sha: phase.branch
                    });
                    commits = branchCommits.data.length;
                } catch (error) {
                    // Branch doesn't exist
                }

                // Get issue
                const issues = await this.octokit.rest.issues.listForRepo({
                    ...this.repo,
                    state: 'all'
                });

                const phaseIssue = issues.data.find(issue =>
                    issue.title.includes(phase.title)
                );

                report.phases.push({
                    title: phase.title,
                    branch: phase.branch,
                    status: this.calculatePhaseStatus(branchExists, phaseIssue),
                    branchExists,
                    commits,
                    issueNumber: phaseIssue ? phaseIssue.number : null,
                    issueState: phaseIssue ? phaseIssue.state : null
                });

            } catch (error) {
                console.error(`❌ Failed to analyze ${phase.title}:`, error.message);
            }
        }

        console.log('\n📋 Roadmap Status Report:');
        report.phases.forEach(phase => {
            console.log(`  ${phase.status} ${phase.title}`);
            if (phase.branchExists) {
                console.log(`    Branch: ${phase.branch} (${phase.commits} commits)`);
            }
            if (phase.issueNumber) {
                console.log(`    Issue: #${phase.issueNumber} (${phase.issueState})`);
            }
        });

        return report;
    }
}

// CLI interface
async function main() {
    const command = process.argv[2];

    if (!process.env.GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN environment variable required');
        process.exit(1);
    }

    const sync = new RoadmapSync();

    switch (command) {
    case 'create-issues':
        await sync.createPhaseIssues();
        break;

    case 'sync':
        await sync.syncProgress();
        break;

    case 'status':
        await sync.generateStatusReport();
        break;

    default:
        console.log(`
GitHub Roadmap Sync

Usage:
  node github-sync.js create-issues  # Create GitHub issues for roadmap phases
  node github-sync.js sync          # Sync progress from GitHub activity
  node github-sync.js status        # Generate status report

Environment Variables Required:
  GITHUB_TOKEN  # GitHub personal access token
  GITHUB_OWNER  # Repository owner (default: ayan)
  GITHUB_REPO   # Repository name (default: botd)
            `);
        break;
    }
}

// Run if called directly
if (require.main === module) {
    main().catch(error => {
        console.error('❌ Command failed:', error.message);
        process.exit(1);
    });
}

module.exports = { RoadmapSync };
