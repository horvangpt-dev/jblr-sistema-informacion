# Fi_nothotaxon_in.R
#'
#' @title Checks if a nothotaxon is listed in 'Flora iberica'
#'
#' @description Checks if a hybrid name is in the 'Flora iberica' checklist, reading from http://www.floraiberica.es.
#'
#' @param hybrid_formula A `character` with a hybrid formula (i.e. a hybrid taxon name).
#'
#' @details This function reads from http://www.floraiberica.es and checks if a given nothotaxon is present in the 'Flora iberica' checklist.
#'
#' @return A `vector` with two components. The first component ('listed.in.Fi') is `TRUE` if the searched `hybrid_formula` is listed in 'Flora iberica'; is `FALSE` if the searched `hybrid_formula` is not found in Flora iberica' (e.g. is mistyped or out of 'Flora iberica' scope, or belongs to a not yet published genus). A second component ('message') gives further information to the user.
#'
#' @author Tiago Monteiro-Henriques. E-mail: \email{tmh.dev@@icloud.com}.
#'
#' @export
#'
Fi_nothotaxon_in <- function(hybrid_formula) {
  if (is.null(hybrid_formula)) {stop("Argument hybrid_formula can not be NULL.")}
  hybrid_formula_mod <- gsub(" ", "+", hybrid_formula)
  Fi_result_syn <- readLines(paste0("http://www.floraiberica.es/PHP/cientificos2.php?paren=", hybrid_formula_mod), encoding="latin1", warn=FALSE) #For now "latin1" encoding seems appropriate. #As the genus is abbreviated in the hybrid_formula, it is possible that rare cases require also the genus. Not implemented for now.
  i <- grep("<TD><br /><b><i>", Fi_result_syn) #finds index of element with names (synonyms) #NOT SURE THAT THIS WORK ALWAYS!
  if (length(i)==0) {return(c(listed.in.Fi=FALSE, message="Nothotaxon not found."))} #Attention: if last instruction fails, the hybrid formula might be present.
  temp1 <- clean_stuff(Fi_result_syn[i], stuff = c("<([^<>]*)>", "&nbsp;", "\t"))
  temp2 <- clean_whitespaces(temp1)
  if (identical(hybrid_formula, temp2)) {return(c(listed.in.Fi=TRUE, message="Successful."))} else {stop("Something unexpected happened, please check code.")}
}
