const axios = require('axios').default;
const core = require('@actions/core');
const github = require('@actions/github');

const API_BASE = 'https://api.github.com/graphql';

const run = async () => {
  const GITHUB_ORG = core.getInput('github_org');
  const GITHUB_TOKEN = core.getInput('gitub_token', { required: true });
  const GITHUB_PROJECT_TITLE = core.getInput('github_project_title', {
    required: true,
  });

  const sendGraphql = async query => await axios({
    method: 'post',
    url: `${API_BASE}`,
    headers: {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'User-Agent': 'js/axios',
      'Content-Type': 'application/json',
    },
    data: {
      query,
    },
  });

  // const {
  //   repo: {
  //     repoOwner: repoOwnerFromContext,
  //   },
  // } = github.context;

  core.startGroup('Lookup project');
  const ORG = GITHUB_ORG;
  const listProjectsQuery = `{
    organization(login: "${ORG}") {
      projectsV2(first: 20) {
        nodes {id title}
      }
    }
  }`;
  core.debug(`Listing projects for organization "${ORG}": ${listProjectsQuery}`);
  const res = await sendGraphql(listProjectsQuery);
  core.info(`Listed projects for organization "${ORG}" OK: ${JSON.stringify(res.data)}`);

  core.debug(`Finding project by title "${GITHUB_PROJECT_TITLE}"...`);
  const {
    data: {
      data: {
        organization: {
          projectsV2: {
            nodes: projects,
          },
        },
      },
    },
  } = res;
  const project = projects.find(project => GITHUB_PROJECT_TITLE === project.title);
  if (!project) {
    // add double quotes to make easier in debugging
    const names = projects.map(project => `"${project.title}"`);
    throw new Error(`Could not find project with title: "${GITHUB_PROJECT_TITLE}" (found: ${names.join(',')})`);
  }
  const { id: projectId } = project;
  core.info(`Found project by title "${GITHUB_PROJECT_TITLE} OK: ID ${JSON.stringify(projectId)}`);
  core.endGroup();

  core.startGroup('Add issue to project');
  core.debug(`Unwrapping issue context payload: ${JSON.stringify(github.context)}`);
  const {
    payload: {
      action: eventName,
      issue: {
        number: issueNumber,
        node_id: contentId,
      },
    },
  } = github.context;
  core.info(`Unwrapped issue context payload OK: Issue #${issueNumber} (node ID ${contentId}) - action ${eventName}`);

  const addQuery = `mutation {
    addProjectV2ItemById(input: {
      projectId: "${projectId}"
      contentId: "${contentId}"
    })
    { item {id} }
  }`;

  core.debug(`Adding issue #${issueNumber} (node ID ${contentId}) to project ID ${projectId}: ${addQuery}`);
  const res2 = await sendGraphql(addQuery);
  const { data } = res2;
  core.debug(`Result of add query was: ${JSON.stringify(data)}`);
  const {
    data: {
      addProjectV2ItemById: {
        item: {
          id,
        },
      },
    },
  } = data;
  core.info(`Added issue #${issueNumber} (node ID ${contentId}) to project #${projectId} OK: node ID ${id}`);
  core.endGroup();
};

(async () => {
  try {
    await run();
  } catch (err) {
    console.error(err);
    core.setFailed(err);
  }
})();
