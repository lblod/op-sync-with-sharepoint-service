import {
  sparqlEscapeString,
  sparqlEscapeDateTime,
  uuid,
  sparqlEscapeUri,
} from "mu";
import { querySudo as query, updateSudo as update } from "@lblod/mu-auth-sudo";
import {
  TASK_TYPE,
  PREFIXES,
  ERROR_URI_PREFIX,
  ERROR_TYPE,
} from "../env-config";
import { parseResult } from "./utils";

export async function isTask(subject) {
  const queryStr = `
    ${PREFIXES}
    ASK {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(subject)} as ?subject)
        ?subject a ${sparqlEscapeUri(TASK_TYPE)}.
      }
    }
  `;
  const result = await query(queryStr);
  return result.boolean;
}

export async function loadTask(subject) {
  const queryTask = `
    ${PREFIXES}
    SELECT DISTINCT ?graph ?task ?id ?job ?created ?modified ?status ?index ?operation ?error WHERE {
      GRAPH ?graph {
        BIND(${sparqlEscapeUri(subject)} as ?task)
        ?task a ${sparqlEscapeUri(TASK_TYPE)}.
        ?task dct:isPartOf ?job;
          mu:uuid ?id;
          dct:created ?created;
          dct:modified ?modified;
          adms:status ?status;
          task:index ?index;
          task:operation ?operation.

        OPTIONAL { ?task task:error ?error. }
      }
    }
  `;

  const task = parseResult(await query(queryTask))[0];
  if (!task) return null;

  //now fetch the hasMany. Easier to parse these
  const queryParentTasks = `
    ${PREFIXES}
    SELECT DISTINCT ?task ?parentTask WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(subject)} as ?task)
        ?task cogs:dependsOn ?parentTask.
      }
    }
  `;

  const parentTasks = parseResult(await query(queryParentTasks)).map(
    (row) => row.parentTask
  );
  task.parentSteps = parentTasks;

  const queryResultsContainers = `
    ${PREFIXES}
    SELECT DISTINCT ?task ?resultsContainer WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(subject)} as ?task)
        ?task task:resultsContainer ?resultsContainer.
      }
    }
  `;

  const resultsContainers = parseResult(
    await query(queryResultsContainers)
  ).map((row) => row.resultsContainer);
  task.resultsContainers = resultsContainers;

  const queryInputContainers = `
    ${PREFIXES}
    SELECT DISTINCT ?task ?inputContainer WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(subject)} as ?task)
        ?task task:inputContainer ?inputContainer.
      }
    }
  `;

  const inputContainers = parseResult(await query(queryInputContainers)).map(
    (row) => row.inputContainer
  );
  task.inputContainers = inputContainers;
  return task;
}

export async function updateTaskStatus(task, status) {
  await update(`
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    PREFIX adms: <http://www.w3.org/ns/adms#>
    PREFIX dct: <http://purl.org/dc/terms/>
    DELETE {
      GRAPH ?g {
        ?subject adms:status ?status .
        ?subject dct:modified ?modified.
      }
    }
    INSERT {
      GRAPH ?g {
        ?subject adms:status ${sparqlEscapeUri(status)}.
        ?subject dct:modified ${sparqlEscapeDateTime(new Date())}.
      }
    }
    WHERE {
      GRAPH ?g {
        BIND(${sparqlEscapeUri(task.task)} as ?subject)
        ?subject adms:status ?status .
        OPTIONAL { ?subject dct:modified ?modified. }
      }
    }
  `);
}

export async function appendTaskError(task, errorMsg) {
  const id = uuid();
  const uri = ERROR_URI_PREFIX + id;

  const queryError = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(task.graph)}{
        ${sparqlEscapeUri(uri)} a ${sparqlEscapeUri(ERROR_TYPE)};
          mu:uuid ${sparqlEscapeString(id)};
          oslc:message ${sparqlEscapeString(errorMsg)}.
        ${sparqlEscapeUri(task.task)} task:error ${sparqlEscapeUri(uri)}.
      }
    }
  `;

  await update(queryError);
}

export async function appendGraphDatacontainerToTask(task, container) {
  //Note: container.subject -> skos:concept to describe the kind of data the container contains
  const queryStr = `
    ${PREFIXES}
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(task.graph)} {
        ${sparqlEscapeUri(container.uri)} a nfo:DataContainer.
        ${sparqlEscapeUri(container.uri)} dct:subject ${sparqlEscapeUri(
    container.subject
  )}.
        ${sparqlEscapeUri(container.uri)} mu:uuid ${sparqlEscapeString(
    container.id
  )}.
        ${sparqlEscapeUri(container.uri)} task:hasGraph ${sparqlEscapeUri(
    container.graphUri
  )}.
        ${sparqlEscapeUri(task.task)} task:resultsContainer ${sparqlEscapeUri(
    container.uri
  )}.
      }
    }
  `;
  await update(queryStr);
}

export async function appendTaskResultFile(task, container, fileUri) {
  const queryStr = `
    PREFIX dct: <http://purl.org/dc/terms/>
    PREFIX task: <http://redpencil.data.gift/vocabularies/tasks/>
    PREFIX nfo: <http://www.semanticdesktop.org/ontologies/2007/03/22/nfo#>
    PREFIX mu: <http://mu.semte.ch/vocabularies/core/>
    INSERT DATA {
      GRAPH ${sparqlEscapeUri(task.graph)} {
        ${sparqlEscapeUri(container.uri)} a nfo:DataContainer.
        ${sparqlEscapeUri(container.uri)} dct:subject ${sparqlEscapeUri(
    container.subject
  )}.
        ${sparqlEscapeUri(container.uri)} mu:uuid ${sparqlEscapeString(
    container.id
  )}.
        ${sparqlEscapeUri(container.uri)} task:hasFile ${sparqlEscapeUri(
    fileUri
  )}.
        ${sparqlEscapeUri(task.task)} task:resultsContainer ${sparqlEscapeUri(
    container.uri
  )}.
      }
    }
  `;

  await update(queryStr);
}
