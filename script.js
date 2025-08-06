class ResponsibleTippingFinder {
    constructor() {
        this.projects = [];
        this.filteredProjects = [];
        this.init();
    }

    async init() {
        await this.loadProjects();
        this.renderProjects();
        this.setupEventListeners();
    }

    async loadProjects() {
        try {
            // Get trending projects
            const response = await fetch('/api/v1/feed/trending?limit=50');
            const data = await response.json();
            
            this.projects = data.feed.data;
            console.log(`Loaded ${this.projects.length} projects`);

            // Filter projects based on criteria
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading projects:', error);
            // Fallback to search if trending fails
            await this.loadFromSearch();
        }
    }

    async loadFromSearch() {
        try {
            // Search for various creative terms to find diverse projects
            const searchTerms = ['game', 'art', 'tool', 'creative', 'portfolio', 'demo', 'experiment'];
            const allProjects = [];
            
            for (const term of searchTerms) {
                const response = await fetch(`/api/v1/feed/search/newest/${term}?limit=20`);
                const data = await response.json();
                allProjects.push(...data.feed.data);
            }
            
            this.projects = allProjects;
            await this.filterDeservingProjects();
            
        } catch (error) {
            console.error('Error loading from search:', error);
        }
    }

    async filterDeservingProjects() {
        const filteredProjects = [];
        
        for (const projectData of this.projects) {
            if (await this.isDeservingProject(projectData)) {
                filteredProjects.push(projectData);
            }
        }
        
        // Remove duplicates and limit results
        this.filteredProjects = this.removeDuplicates(filteredProjects).slice(0, 12);
        console.log(`Filtered to ${this.filteredProjects.length} deserving projects`);
    }

    async isDeservingProject(projectData) {
        const { project, site } = projectData;
        
        if (!project || !site) return false;
        
        // Skip if no title or deleted
        if (!project.title || project.deleted_at) return false;
        
        const title = (project.title || '').toLowerCase();
        const description = (project.description || '').toLowerCase();
        
        // Filter out gambling and tip-begging projects
        const badKeywords = [
            'tip', 'gamble', 'gambling', 'bet', 'betting', 'casino', 'lottery', 
            'jackpot', 'prize', 'win money', 'pay me', 'donate', 'giveaway',
            'tip to win', 'tip me', 'send tips', 'credit', 'coins', 'reward',
            'payout', 'cash', 'money', 'fund', 'support me'
        ];
        
        // Check if project contains gambling/begging keywords
        const containsBadKeywords = badKeywords.some(keyword => 
            title.includes(keyword) || description.includes(keyword)
        );
        
        if (containsBadKeywords) return false;
        
        // Look for quality indicators
        const stats = project.stats || {};
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        
        // Filter criteria:
        // - Has some views (shows it's been seen) but not too many comments
        // - Low comment to view ratio (indicates underappreciated)
        // - Has a proper title and seems like actual content
        const commentToViewRatio = views > 0 ? comments / views : 0;
        
        return views > 10 && // Has some engagement
               views < 10000 && // Not already super popular
               comments < 50 && // Low comments
               commentToViewRatio < 0.1 && // Low comment ratio
               title.length > 3 && // Has a real title
               this.seemsLikeQualityProject(title, description);
    }

    seemsLikeQualityProject(title, description) {
        // Look for indicators of quality/effort
        const qualityKeywords = [
            'game', 'art', 'tool', 'portfolio', 'demo', 'experiment', 'creative',
            'interactive', 'animation', 'music', 'sound', 'design', 'code',
            'learn', 'tutorial', 'educational', 'simulation', 'visualization',
            'generator', 'calculator', 'dashboard', 'app', 'website', 'blog'
        ];
        
        const text = title + ' ' + description;
        
        return qualityKeywords.some(keyword => text.includes(keyword)) ||
               title.length > 10; // At least a descriptive title
    }

    removeDuplicates(projects) {
        const seen = new Set();
        return projects.filter(projectData => {
            const id = projectData.project?.id;
            if (seen.has(id)) return false;
            seen.add(id);
            return true;
        });
    }

    renderProjects() {
        const loadingScreen = document.getElementById('loading-screen');
        const showcase = document.getElementById('project-showcase');
        const grid = document.getElementById('project-grid');
        const stats = document.getElementById('filter-stats');
        
        // Hide loading screen
        setTimeout(() => {
            loadingScreen.style.display = 'none';
            showcase.style.display = 'block';
        }, 2000);
        
        // Update stats
        stats.textContent = `Found ${this.filteredProjects.length} deserving projects out of ${this.projects.length} scanned`;
        
        // Clear grid
        grid.innerHTML = '';
        
        // Render projects
        this.filteredProjects.forEach(projectData => {
            const card = this.createProjectCard(projectData);
            grid.appendChild(card);
        });
    }

    createProjectCard(projectData) {
        const { project, site } = projectData;
        const stats = project.stats || {};
        
        const card = document.createElement('div');
        card.className = 'project-card';
        
        // Generate thumbnail URL
        const thumbnailUrl = site ? `https://images.websim.com/v1/site/${site.id}/600` : '';
        
        card.innerHTML = `
            <img src="${thumbnailUrl}" alt="Project thumbnail" class="project-thumbnail" 
                 onerror="this.style.display='none'">
            <div class="project-title">${project.title || 'Untitled Project'}</div>
            <div class="project-creator">
                <img src="https://images.websim.com/avatar/${project.created_by?.username || 'anonymous'}" 
                     alt="Creator" class="creator-avatar" onerror="this.style.display='none'">
                <span>@${project.created_by?.username || 'anonymous'}</span>
            </div>
            <div class="project-stats">
                <span>👀 ${stats.views || 0} views</span>
                <span>💬 ${stats.comments || 0} comments</span>
                <span>❤️ ${stats.likes || 0} likes</span>
            </div>
            <div class="support-reason">
                ${this.getSupportReason(stats)}
            </div>
        `;
        
        card.addEventListener('click', () => {
            this.openProject(site, project);
        });
        
        return card;
    }

    getSupportReason(stats) {
        const views = stats.views || 0;
        const comments = stats.comments || 0;
        const likes = stats.likes || 0;
        
        if (views > 1000 && comments < 10) {
            return "🎯 High views, low engagement - needs appreciation!";
        } else if (likes < 10) {
            return "💎 Hidden gem - deserves more recognition!";
        } else if (comments === 0) {
            return "💬 No comments yet - be the first to show support!";
        } else {
            return "⭐ Quality project with room for more support!";
        }
    }

    openProject(site, project) {
        const iframe = document.getElementById('fullscreen-iframe');
        const frame = document.getElementById('project-frame');
        const title = document.querySelector('.iframe-title');
        
        if (site) {
            frame.src = `https://websim.com/c/${site.id}`;
            title.textContent = project.title || 'Untitled Project';
            iframe.style.display = 'block';
        }
    }

    setupEventListeners() {
        const backBtn = document.getElementById('back-btn');
        const refreshBtn = document.getElementById('refresh-btn');
        const iframe = document.getElementById('fullscreen-iframe');
        
        backBtn.addEventListener('click', () => {
            iframe.style.display = 'none';
            document.getElementById('project-frame').src = '';
        });
        
        refreshBtn.addEventListener('click', async () => {
            refreshBtn.textContent = '🔄 Scanning...';
            refreshBtn.disabled = true;
            
            await this.loadProjects();
            this.renderProjects();
            
            refreshBtn.textContent = '🔄 Find More Deserving Projects';
            refreshBtn.disabled = false;
        });
        
        // Close iframe with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && iframe.style.display !== 'none') {
                iframe.style.display = 'none';
                document.getElementById('project-frame').src = '';
            }
        });
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ResponsibleTippingFinder();
});

